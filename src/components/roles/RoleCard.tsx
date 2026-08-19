import type { Role, RoleMark } from "../../lib/types";
import { STATUS_LABELS, TIER_LABELS } from "../../lib/types";
import { SETTING_LABELS, WORK_MODEL_LABELS, excerpt, formatLocation, formatPosted } from "../../lib/format";
import { PinButton } from "../ui/PinButton";
import "./role-card.css";

interface Props {
  role: Role;
  mark: RoleMark;
  onOpen: (roleId: string) => void;
  onTogglePin: (roleId: string) => void;
}

export function RoleCard({ role, mark, onOpen, onTogglePin }: Props) {
  return (
    <article className={`role-card role-card--${role.specialty}`} data-tour="role-card">
      <div className="role-card__bar" aria-hidden="true" />

      <div className="role-card__body">
        <header className="role-card__head">
          <button type="button" className="role-card__open" onClick={() => onOpen(role.id)}>
            <h3 className="role-card__title">{role.title}</h3>
          </button>
          <PinButton pinned={mark.pinned} onToggle={() => onTogglePin(role.id)} label={role.title} />
        </header>

        <p className="role-card__org">
          {role.org || <span className="role-card__no-org">Employer not stated</span>}
          <span className="role-card__dot" aria-hidden="true">·</span>
          <span className="role-card__place">{formatLocation(role.geo)}</span>
        </p>

        <ul className="role-card__tags">
          <li className={`tag tag--tier-${role.tier}`}>{TIER_LABELS[role.tier]}</li>
          <li className="tag">{SETTING_LABELS[role.setting]}</li>
          {role.workModel !== "onsite" && <li className="tag">{WORK_MODEL_LABELS[role.workModel]}</li>}
          {role.isLeadership && <li className="tag tag--accent">Leadership</li>}
          {role.isNew && <li className="tag tag--new">New this week</li>}
          {role.stale && <li className="tag tag--stale">Source unreachable</li>}
          {mark.status !== "new" && <li className="tag tag--status">{STATUS_LABELS[mark.status]}</li>}
        </ul>

        {role.description && <p className="role-card__excerpt">{excerpt(role.description)}</p>}

        <footer className="role-card__foot">
          <span className="role-card__source">
            via {role.source.name}
            {role.alsoSeenOn.length > 0 && ` (+${role.alsoSeenOn.length} other)`}
          </span>
          <span className="role-card__posted tnum">{formatPosted(role)}</span>
        </footer>
      </div>

      <div className="role-card__score">
        <span className="role-card__score-value tnum">{role.score}</span>
        <span className="eyebrow">fit</span>
      </div>
    </article>
  );
}
