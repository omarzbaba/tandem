import { useEffect, useRef } from "react";
import type { Marks, Metro } from "../../lib/types";
import { formatLocation, formatRunTime } from "../../lib/format";
import type { NotificationGroup } from "../../hooks/useNotifications";
import "./notification-panel.css";

interface Props {
  groups: NotificationGroup[];
  newTogetherAreas: Metro[];
  unreadCount: number;
  lastSeen: string;
  marks: Marks;
  partnerALabel: string;
  partnerBLabel: string;
  onOpenRole: (roleId: string) => void;
  onMarkAllSeen: () => void;
  onClose: () => void;
}

/** "Mon 18 Aug" — the batch a set of postings arrived in. */
function batchLabel(date: string, index: number) {
  if (index === 0) return `Latest — ${formatRunTime(date)}`;
  return formatRunTime(date);
}

export function NotificationPanel({
  groups,
  newTogetherAreas,
  unreadCount,
  lastSeen,
  marks,
  partnerALabel,
  partnerBLabel,
  onOpenRole,
  onMarkAllSeen,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="notif-scrim" onClick={onClose}>
      <aside
        className="notif"
        role="dialog"
        aria-modal="true"
        aria-label="What's new"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="notif__head">
          <div>
            <h2 className="notif__title display">What's new</h2>
            <p className="notif__since">
              {unreadCount > 0
                ? `${unreadCount} post${unreadCount === 1 ? "" : "s"} since ${formatRunTime(lastSeen)}`
                : `Nothing new since ${formatRunTime(lastSeen)}`}
            </p>
          </div>
          <button type="button" className="notif__close" onClick={onClose} ref={closeRef} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="notif__scroll">
          {unreadCount === 0 && (
            <div className="notif__empty">
              <p>
                You are up to date. The board re-sweeps every Monday morning — anything that turns up
                will be waiting here.
              </p>
            </div>
          )}

          {newTogetherAreas.length > 0 && (
            <section className="notif__section notif__section--together">
              <h3 className="eyebrow">New places you could both work</h3>
              <ul className="notif__areas">
                {newTogetherAreas.map((m) => (
                  <li key={m.key}>
                    <span className="notif__area-name">{m.label}</span>
                    <span className="notif__area-meta">
                      {m.vascularCount} {partnerALabel.toLowerCase()} · {m.radiologyCount}{" "}
                      {partnerBLabel.toLowerCase()}
                      {m.sameOrg && " · same employer"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.map((group, i) => (
            <section className="notif__section" key={group.date}>
              <h3 className="eyebrow">
                {batchLabel(group.date, i)} · {group.roles.length}
              </h3>
              <ul className="notif__list">
                {group.roles.map((role) => (
                  <li key={role.id} className={`notif__item notif__item--${role.specialty}`}>
                    <button
                      type="button"
                      className="notif__item-button"
                      onClick={() => {
                        onOpenRole(role.id);
                        onClose();
                      }}
                    >
                      <span className="notif__item-title">{role.title}</span>
                      <span className="notif__item-meta">
                        {role.org || "Employer not stated"} · {formatLocation(role.geo)}
                      </span>
                    </button>
                    <span className="notif__item-score tnum">{role.score}</span>
                    {marks[role.id]?.pinned && (
                      <span className="notif__item-pinned" title="Already pinned">
                        ★
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {unreadCount > 0 && (
          <footer className="notif__foot">
            <button type="button" className="notif__mark" onClick={onMarkAllSeen}>
              Mark all as read
            </button>
            <span className="notif__foot-note">Read state is yours alone — it does not clear theirs.</span>
          </footer>
        )}
      </aside>
    </div>
  );
}
