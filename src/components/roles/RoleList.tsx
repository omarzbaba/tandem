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
  /** Max age in days of the posting, or 0 for any age. */
  postedWithin: number;
}

/** How a list of roles is ordered. */
export type SortKey = "fit" | "newest" | "oldest";

export const SORT_LABELS: Record<SortKey, string> = {
  fit: "Best fit",
  newest: "Newest",
  oldest: "Oldest",
};

export const DEFAULT_FILTERS: RoleFilters = {
  country: "all",
  setting: "all",
  workModel: "all",
  minScore: 0,
  search: "",
  newOnly: false,
  postedWithin: 0,
};

/**
 * Roughly one in eight postings carries no date — some employer feeds simply
 * omit it. Those are counted separately rather than quietly dropped: a date
 * filter that silently swallows undated posts would hide real jobs and never
 * say so.
 */
export function countUndated(roles: Role[], f: RoleFilters, specialty?: Specialty): number {
  if (!f.postedWithin) return 0;
  const withoutDateFilter = applyFilters(roles, { ...f, postedWithin: 0 }, specialty);
  return withoutDateFilter.filter((r) => r.ageDays == null).length;
}

export function applyFilters(roles: Role[], f: RoleFilters, specialty?: Specialty): Role[] {
  const needle = f.search.trim().toLowerCase();
  return roles.filter((r) => {
    if (specialty && r.specialty !== specialty) return false;
    if (f.country !== "all" && r.geo.country !== f.country) return false;
    if (f.setting !== "all" && r.setting !== f.setting) return false;
    if (f.workModel !== "all" && r.workModel !== f.workModel) return false;
    if (r.score < f.minScore) return false;
    if (f.newOnly && !r.isNew) return false;
    // An undated posting cannot be confirmed as recent, so it fails an age
    // filter. The UI reports how many were held back for this reason.
    if (f.postedWithin && (r.ageDays == null || r.ageDays > f.postedWithin)) return false;
    if (needle) {
      const hay = `${r.title} ${r.org} ${r.locationText} ${r.description}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Undated posts sort last under either date order rather than being treated as
 * infinitely old or infinitely new — both would be a claim the data cannot
 * support. Fit is the tiebreak so the ordering is always deterministic.
 */
export function sortRoles(roles: Role[], sort: SortKey): Role[] {
  const byFit = (a: Role, b: Role) => b.score - a.score;
  if (sort === "fit") return [...roles].sort(byFit);

  return [...roles].sort((a, b) => {
    const aAge = a.ageDays;
    const bAge = b.ageDays;
    if (aAge == null && bAge == null) return byFit(a, b);
    if (aAge == null) return 1;
    if (bAge == null) return -1;
    if (aAge !== bAge) return sort === "newest" ? aAge - bAge : bAge - aAge;
    return byFit(a, b);
  });
}

interface Props {
  roles: Role[];
  marks: Marks;
  emptyMessage: string;
  sort: SortKey;
  onOpenRole: (roleId: string) => void;
  onTogglePin: (roleId: string) => void;
}

export function RoleList({ roles, marks, emptyMessage, sort, onOpenRole, onTogglePin }: Props) {
  const sorted = useMemo(() => sortRoles(roles, sort), [roles, sort]);

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
