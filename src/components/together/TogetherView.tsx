import type { Marks, Metro, Role } from "../../lib/types";
import { MetroCard } from "./MetroCard";
import { RemoteUnlockedCard } from "./RemoteUnlockedCard";
import "./together-view.css";

interface Props {
  metros: Metro[];
  rolesById: Map<string, Role>;
  marks: Marks;
  radiusMiles: number;
  partnerALabel: string;
  partnerBLabel: string;
  onOpenRole: (roleId: string) => void;
  onTogglePin: (roleId: string) => void;
}

/**
 * The headline tab: only places where BOTH specialties have an opening inside
 * the commutable radius.
 *
 * One-sided areas are shown too, but separately and below — a metro where only
 * one of them has a post is a lead worth a phone call, not a place to move to,
 * and mixing the two would quietly overstate how many real options exist.
 */
export function TogetherView({
  metros,
  rolesById,
  marks,
  radiusMiles,
  partnerALabel,
  partnerBLabel,
  onOpenRole,
  onTogglePin,
}: Props) {
  const together = metros.filter((m) => m.isTogether);
  // Places the surgeon can take where she reads remotely. A real option, kept
  // in its own band so it is never counted as both-on-site.
  const remoteUnlocked = metros.filter((m) => !m.isTogether && m.remoteUnlocked);
  // Stated once for the whole band rather than repeated on every card.
  const remotePool = remoteUnlocked[0]?.remotePartnerCount ?? 0;
  const bestRemoteScore = remoteUnlocked[0]?.bestRemoteRadiologyScore ?? 0;
  const oneSided = metros
    .filter((m) => !m.isTogether && !m.remoteUnlocked)
    .sort((a, b) => Math.max(b.bestVascularScore, b.bestRadiologyScore) - Math.max(a.bestVascularScore, a.bestRadiologyScore))
    .slice(0, 12);

  if (together.length === 0 && remoteUnlocked.length === 0) {
    return (
      <div className="empty">
        <h2 className="empty__title display">No overlap this week</h2>
        <p>
          Nothing yet where both of you have an opening within {radiusMiles} miles. Widen the
          radius, or look at the two specialty tabs — a strong post on one side is often worth a
          call even before the other appears.
        </p>
      </div>
    );
  }

  return (
    <>
      <ol className="together-grid">
        {together.map((metro, i) => (
          <li key={metro.key}>
            <MetroCard
              metro={metro}
              rolesById={rolesById}
              marks={marks}
              partnerALabel={partnerALabel}
              partnerBLabel={partnerBLabel}
              lead={i === 0}
              onOpenRole={onOpenRole}
              onTogglePin={onTogglePin}
            />
          </li>
        ))}
      </ol>

      {remoteUnlocked.length > 0 && (
        <section className="remote-band">
          <h2 className="remote-band__title">
            <span className="display">
              {partnerALabel} on site, {partnerBLabel.toLowerCase()} remote
            </span>
            <span className="remote-band__sub">
              Diagnostic radiology reads from anywhere and vascular surgery does not, so a remote
              post on her side makes every one of these surgical jobs workable. Distance stops
              being the constraint.
              {remotePool > 0 && (
                <>
                  {" "}
                  <strong className="tnum">{remotePool}</strong> remote{" "}
                  {remotePool === 1 ? "post" : "posts"} on the board right now, the best scoring{" "}
                  <strong className="tnum">{bestRemoteScore}</strong>.
                </>
              )}
            </span>
          </h2>
          <ul className="remote-band__grid">
            {remoteUnlocked.map((m) => (
              <li key={m.key}>
                <RemoteUnlockedCard
                  metro={m}
                  rolesById={rolesById}
                  marks={marks}
                  partnerALabel={partnerALabel}
                  partnerBLabel={partnerBLabel}
                  onOpenRole={onOpenRole}
                  onTogglePin={onTogglePin}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {oneSided.length > 0 && (
        <section className="one-sided">
          <h2 className="one-sided__title">
            <span className="display">Half an opportunity</span>
            <span className="one-sided__sub">
              One of you has a post here; the other does not — yet. Worth a call to the department.
            </span>
          </h2>
          <ul className="one-sided__list scroll-x">
            {oneSided.map((m) => (
              <li key={m.key} className={`one-sided__item one-sided__item--${m.missingSide === "radiology" ? "a" : "b"}`}>
                <p className="one-sided__place">{m.label}</p>
                <p className="one-sided__detail">
                  {m.vascularCount > 0
                    ? `${m.vascularCount} ${partnerALabel.toLowerCase()}`
                    : `${m.radiologyCount} ${partnerBLabel.toLowerCase()}`}
                  {" · no "}
                  {m.missingSide === "radiology" ? partnerBLabel.toLowerCase() : partnerALabel.toLowerCase()}
                  {" posted"}
                </p>
                {/* The label already carries the country for non-US areas. */}
                {m.approximate && <p className="one-sided__country">Approximate location</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
