import type { Metro, Marks, Role } from "../../lib/types";
import { formatSeparation } from "../../lib/format";
import { RoleRow } from "../roles/RoleRow";
import "./metro-card.css";

interface Props {
  metro: Metro;
  rolesById: Map<string, Role>;
  marks: Marks;
  partnerALabel: string;
  partnerBLabel: string;
  /** The first card gets editorial prominence rather than sitting in a uniform grid. */
  lead?: boolean;
  onOpenRole: (roleId: string) => void;
  onTogglePin: (roleId: string) => void;
}

/**
 * One commutable area, presented as the couple actually evaluates it: his side
 * and her side next to each other, with the distance between them stated
 * plainly in the middle rather than buried in a detail view.
 */
export function MetroCard({
  metro,
  rolesById,
  marks,
  partnerALabel,
  partnerBLabel,
  lead = false,
  onOpenRole,
  onTogglePin,
}: Props) {
  const vascular = metro.vascularIds.map((id) => rolesById.get(id)).filter(Boolean) as Role[];
  const radiology = metro.radiologyIds.map((id) => rolesById.get(id)).filter(Boolean) as Role[];
  const pinnedHere = [...metro.vascularIds, ...metro.radiologyIds].filter(
    (id) => marks[id]?.pinned
  ).length;

  return (
    <article className={`metro-card${lead ? " metro-card--lead" : ""}`}>
      <header className="metro-card__head">
        <div className="metro-card__identity">
          <h3 className="metro-card__name display">{metro.label}</h3>
          <p className="metro-card__meta tnum">
            <span className="metro-card__count metro-card__count--a">
              {metro.vascularCount} {partnerALabel.toLowerCase()}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="metro-card__count metro-card__count--b">
              {metro.radiologyCount} {partnerBLabel.toLowerCase()}
            </span>
            {pinnedHere > 0 && <span className="metro-card__pinned"> · {pinnedHere} pinned</span>}
          </p>
        </div>

        <div className="metro-card__score" aria-label={`Together score ${metro.score} out of 100`}>
          <span className="metro-card__score-value tnum display">{metro.score}</span>
          <span className="metro-card__score-label eyebrow">together</span>
        </div>
      </header>

      <ul className="metro-card__flags">
        {metro.sameOrg && (
          <li className="flag flag--strong" title="One employer has openings in both specialties">
            Same employer hiring both
          </li>
        )}
        <li className="flag">
          {metro.spanMiles < 1
            ? "Same city"
            : `${formatSeparation(metro.spanMiles, metro.spanDriveMinutes)} apart`}
        </li>
        {metro.approximate && (
          <li className="flag flag--caution" title="At least one posting did not name a city">
            Approximate location
          </li>
        )}
      </ul>

      <div className="metro-card__split">
        <section className="metro-card__side metro-card__side--a" aria-label={partnerALabel}>
          <h4 className="eyebrow">{partnerALabel}</h4>
          <ul>
            {vascular.slice(0, lead ? 4 : 2).map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                pinned={marks[role.id]?.pinned ?? false}
                onOpen={onOpenRole}
                onTogglePin={onTogglePin}
              />
            ))}
          </ul>
          {vascular.length > (lead ? 4 : 2) && (
            <p className="metro-card__more tnum">
              +{vascular.length - (lead ? 4 : 2)} more
            </p>
          )}
        </section>

        <div className="metro-card__link" aria-hidden="true">
          <span className="metro-card__link-line" />
        </div>

        <section className="metro-card__side metro-card__side--b" aria-label={partnerBLabel}>
          <h4 className="eyebrow">{partnerBLabel}</h4>
          <ul>
            {radiology.slice(0, lead ? 4 : 2).map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                pinned={marks[role.id]?.pinned ?? false}
                onOpen={onOpenRole}
                onTogglePin={onTogglePin}
              />
            ))}
          </ul>
          {radiology.length > (lead ? 4 : 2) && (
            <p className="metro-card__more tnum">
              +{radiology.length - (lead ? 4 : 2)} more
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
