import { useMemo } from "react";
import type { Marks, Role, Specialty } from "../../lib/types";
import { RoleCard } from "./RoleCard";
import { EMPTY_MARK } from "../../lib/types";
import "./role-list.css";

export interface RoleFilters {
  country: string;
  setting: string;
  workModel: string;
  minScore: number;
  search: string;
  newOnly: boolean;
}

export const DEFAULT_FILTERS: RoleFilters = {
  country: "all",
  setting: "all",
  workModel: "all",
  minScore: 0,
  search: "",
  newOnly: false,
};

export function applyFilters(roles: Role[], f: RoleFilters, specialty?: Specialty): Role[] {
  const needle = f.search.trim().toLowerCase();
  return roles.filter((r) => {
    if (specialty && r.specialty !== specialty) return false;
    if (f.country !== "all" && r.geo.country !== f.country) return false;
    if (f.setting !== "all" && r.setting !== f.setting) return false;
    if (f.workModel !== "all" && r.workModel !== f.workModel) return false;
    if (r.score < f.minScore) return false;
    if (f.newOnly && !r.isNew) return false;
    if (needle) {
      const hay = `${r.title} ${r.org} ${r.locationText} ${r.description}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

interface Props {
  roles: Role[];
  marks: Marks;
  emptyMessage: string;
  onOpenRole: (roleId: string) => void;
  onTogglePin: (roleId: string) => void;
}

export function RoleList({ roles, marks, emptyMessage, onOpenRole, onTogglePin }: Props) {
  const sorted = useMemo(() => [...roles].sort((a, b) => b.score - a.score), [roles]);

  if (sorted.length === 0) {
    return (
      <div className="empty">
        <h2 className="empty__title display">Nothing here</h2>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="role-list">
      {sorted.map((role) => (
        <li key={role.id}>
          <RoleCard
            role={role}
            mark={marks[role.id] ?? EMPTY_MARK}
            onOpen={onOpenRole}
            onTogglePin={onTogglePin}
          />
        </li>
      ))}
    </ul>
  );
}
