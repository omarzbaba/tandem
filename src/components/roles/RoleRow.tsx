import type { Role } from "../../lib/types";
import { PinButton } from "../ui/PinButton";
import "./role-row.css";

interface Props {
  role: Role;
  pinned: boolean;
  onOpen: (roleId: string) => void;
  onTogglePin: (roleId: string) => void;
}

/**
 * The compact form used inside a metro card: enough to judge the post at a
 * glance, and one click from the full detail.
 */
export function RoleRow({ role, pinned, onOpen, onTogglePin }: Props) {
  return (
    <li className={`role-row role-row--${role.specialty}`}>
      <button
        type="button"
        className="role-row__main"
        onClick={() => onOpen(role.id)}
        aria-label={`Open ${role.title} at ${role.org}`}
      >
        <span className="role-row__title">{role.title}</span>
        <span className="role-row__org">{role.org || `via ${role.source.name}`}</span>
      </button>

      <span className="role-row__score tnum" aria-label={`Fit score ${role.score}`}>
        {role.score}
      </span>

      <PinButton pinned={pinned} onToggle={() => onTogglePin(role.id)} label={role.title} />
    </li>
  );
}
