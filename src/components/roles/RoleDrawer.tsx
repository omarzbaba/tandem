import { useEffect, useMemo, useRef, useState } from "react";
import type { Role, RoleMark, RoleStatus } from "../../lib/types";
import { STATUS_LABELS, TIER_LABELS } from "../../lib/types";
import {
  SETTING_LABELS,
  WORK_MODEL_LABELS,
  formatLocation,
  formatPosted,
} from "../../lib/format";
import { buildOutreachEmail, copyText, extractContacts, mailtoUrl, type OutreachIdentity } from "../../lib/outreach";
import { ScoreBars } from "../ui/ScoreBars";
import { PinButton } from "../ui/PinButton";
import "./role-drawer.css";

interface Props {
  role: Role;
  mark: RoleMark;
  identity: OutreachIdentity;
  onClose: () => void;
  onUpdate: (roleId: string, patch: Partial<RoleMark>) => void;
}

const STATUSES: RoleStatus[] = ["new", "interested", "contacted", "applied", "passed"];

export function RoleDrawer({ role, mark, identity, onClose, onUpdate }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [note, setNote] = useState(mark.note);
  const [copied, setCopied] = useState<string | null>(null);

  const contacts = useMemo(() => extractContacts(role), [role]);
  const outreach = useMemo(() => buildOutreachEmail(role, identity), [role, identity]);
  const hue = role.specialty === "vascular" ? "var(--vascular)" : "var(--radiology)";

  useEffect(() => setNote(mark.note), [mark.note, role.id]);

  // The note commits on blur, but Escape closes the drawer without blurring the
  // textarea — so flush any pending edit on unmount too. Refs, not state, so
  // the effect runs exactly once on teardown with the latest values.
  const pending = useRef({ note, saved: mark.note, roleId: role.id });
  pending.current = { note, saved: mark.note, roleId: role.id };
  useEffect(
    () => () => {
      const { note: draft, saved, roleId } = pending.current;
      if (draft !== saved) onUpdate(roleId, { note: draft });
    },
    [onUpdate]
  );

  // Escape closes, and focus moves into the panel so keyboard users are not
  // left behind on the card that opened it.
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, role.id]);

  async function copy(label: string, text: string) {
    const ok = await copyText(text);
    setCopied(ok ? label : "failed");
    setTimeout(() => setCopied(null), 2200);
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${role.title} at ${role.org}`}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head" style={{ borderTopColor: hue }}>
          <div>
            <p className="eyebrow" style={{ color: hue }}>
              {role.specialty === "vascular" ? "Vascular surgery" : "Diagnostic radiology"}
              {role.isInterventional && " · interventional"}
            </p>
            <h2 className="drawer__title display">{role.title}</h2>
            <p className="drawer__org">
              {role.org || "Employer not stated"} — {formatLocation(role.geo)}
            </p>
          </div>
          <div className="drawer__head-actions">
            <PinButton
              pinned={mark.pinned}
              onToggle={() => onUpdate(role.id, { pinned: !mark.pinned })}
              label={role.title}
            />
            <button type="button" className="drawer__close" onClick={onClose} ref={closeRef} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="drawer__scroll">
          <section className="drawer__section">
            <div className="drawer__score-head">
              <span className="drawer__score tnum" style={{ color: hue }}>
                {role.score}
              </span>
              <div>
                <p className="drawer__tier">{TIER_LABELS[role.tier]}</p>
                <p className="drawer__facts">
                  {SETTING_LABELS[role.setting]} · {WORK_MODEL_LABELS[role.workModel]} ·{" "}
                  {formatPosted(role)}
                </p>
              </div>
            </div>
            <ScoreBars subscores={role.subscores} hue={hue} />
          </section>

          {role.reasons.length > 0 && (
            <section className="drawer__section">
              <h3 className="eyebrow">In its favour</h3>
              <ul className="drawer__list drawer__list--good">
                {role.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </section>
          )}

          {role.concerns.length > 0 && (
            <section className="drawer__section">
              <h3 className="eyebrow">Watch out for</h3>
              <ul className="drawer__list drawer__list--bad">
                {role.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="drawer__section">
            <h3 className="eyebrow">Get in touch</h3>
            {contacts.emails.length > 0 || contacts.phones.length > 0 ? (
              <ul className="drawer__contacts">
                {contacts.emails.map((e) => (
                  <li key={e}>
                    <a href={mailtoUrl(e, outreach.subject, outreach.body)}>{e}</a>
                  </li>
                ))}
                {contacts.phones.map((p) => (
                  <li key={p}>
                    <a href={`tel:${p.replace(/[^\d+]/g, "")}`}>{p}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="drawer__muted">
                No contact details in the posting — apply through the link below.
              </p>
            )}

            <div className="drawer__actions">
              <a className="button button--primary" href={role.url} target="_blank" rel="noopener noreferrer">
                Open the posting ↗
              </a>
              <a
                className="button"
                href={mailtoUrl(contacts.emails[0], outreach.subject, outreach.body)}
              >
                Draft an email
              </a>
              <button
                type="button"
                className="button"
                onClick={() => copy("email", `Subject: ${outreach.subject}\n\n${outreach.body}`)}
              >
                {copied === "email" ? "Copied" : "Copy the draft"}
              </button>
            </div>

            <details className="drawer__details">
              <summary>Preview the draft</summary>
              <p className="drawer__draft-subject">{outreach.subject}</p>
              <pre className="drawer__draft">{outreach.body}</pre>
            </details>
          </section>

          <section className="drawer__section">
            <h3 className="eyebrow">Where you are with it</h3>
            <div className="drawer__statuses" role="group" aria-label="Status">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`chip${mark.status === s ? " chip--on" : ""}`}
                  aria-pressed={mark.status === s}
                  onClick={() => onUpdate(role.id, { status: s })}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            <label className="drawer__note-label" htmlFor="role-note">
              Shared note
            </label>
            <textarea
              id="role-note"
              className="drawer__note"
              rows={3}
              value={note}
              placeholder="Anything the two of you need to remember about this one…"
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== mark.note && onUpdate(role.id, { note })}
            />
            {mark.by && (
              <p className="drawer__muted">
                Last touched by {mark.by}
                {mark.updatedAt ? ` on ${new Date(mark.updatedAt).toLocaleDateString()}` : ""}
              </p>
            )}
          </section>

          {role.description && (
            <section className="drawer__section">
              <h3 className="eyebrow">From the posting</h3>
              <p className="drawer__body-text">{role.description}</p>
            </section>
          )}

          <section className="drawer__section drawer__section--quiet">
            <p className="drawer__muted">
              Found via <strong>{role.source.name}</strong>
              {role.alsoSeenOn.length > 0 && (
                <> — also listed on {role.alsoSeenOn.map((s) => s.name).join(", ")}</>
              )}
            </p>
            {role.geo.precision !== "city" && (
              <p className="drawer__muted">
                The posting did not name a city, so this sits at{" "}
                {role.geo.precision === "region" ? "state" : role.geo.precision} level only —
                distances involving it are indicative.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
