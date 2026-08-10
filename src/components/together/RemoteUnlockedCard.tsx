import type { Marks, Metro, Role } from "../../lib/types";
import { RoleRow } from "../roles/RoleRow";
import "./remote-card.css";

interface Props {
  metro: Metro;
  rolesById: Map<string, Role>;
  marks: Marks;
  partnerALabel: string;
  partnerBLabel: string;
  onOpenRole: (roleId: string) => void;
  onTogglePin: (roleId: string) => void;
}

/**
 * A place where the surgeon has an offer and the radiologist would read
 * remotely.
 *
 * Presented separately from a true both-on-site area, and never counted as one:
 * the arrangement is real and often the best option available, but saying "you
 * can both work here" when one of you is working from the spare room would be
 * a different claim entirely.
 */
export function RemoteUnlockedCard({
  metro,
  rolesById,
  marks,
  partnerALabel,
  partnerBLabel,
  onOpenRole,
  onTogglePin,
}: Props) {
  const vascular = metro.vascularIds.map((id) => rolesById.get(id)).filter(Boolean) as Role[];

  return (
    <article className="remote-card">
      <header className="remote-card__head">
        <div>
          <h3 className="remote-card__name display">{metro.label}</h3>
          <p className="remote-card__meta">
            {metro.vascularCount} {partnerALabel.toLowerCase()}{" "}
            {metro.vascularCount === 1 ? "post" : "posts"} on site
          </p>
        </div>
        <div className="remote-card__score">
          <span className="remote-card__score-value tnum display">{metro.score}</span>
          <span className="eyebrow">workable</span>
        </div>
      </header>

      <p className="remote-card__premise">
        <span className="remote-card__badge">Remote</span>
        {partnerBLabel} from anywhere — {metro.remotePartnerCount} remote{" "}
        {metro.remotePartnerCount === 1 ? "post" : "posts"} on the board, best scoring{" "}
        <strong className="tnum">{metro.bestRemoteRadiologyScore}</strong>.
      </p>

      <ul className="remote-card__roles">
        {vascular.slice(0, 3).map((role) => (
          <RoleRow
            key={role.id}
            role={role}
            pinned={marks[role.id]?.pinned ?? false}
            onOpen={onOpenRole}
            onTogglePin={onTogglePin}
          />
        ))}
      </ul>
      {vascular.length > 3 && (
        <p className="remote-card__more tnum">+{vascular.length - 3} more</p>
      )}
    </article>
  );
}
