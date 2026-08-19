import type { RoleFilters, SortKey } from "../roles/RoleList";
import { DEFAULT_FILTERS, SORT_LABELS } from "../roles/RoleList";
import { COUNTRY_NAMES, SETTING_LABELS } from "../../lib/format";
import "./filters.css";

interface Props {
  filters: RoleFilters;
  onChange: (f: RoleFilters) => void;
  radius: number;
  onRadiusChange: (r: number) => void;
  showRadius: boolean;
  /** Sorting only applies to the flat specialty lists, not the metro view. */
  showSort: boolean;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  resultCount: number;
  /** Postings held back purely because they carry no date. */
  undatedHeldBack: number;
}

const COUNTRIES = ["all", "US", "QA", "AE", "SA", "KW", "BH", "OM"];
const SETTINGS = ["all", "academic", "private", "hospital-employed", "government"] as const;
const RADIUS_STOPS = [15, 30, 45, 60, 90, 120];
const POSTED_WITHIN: { value: number; label: string }[] = [
  { value: 0, label: "Any time" },
  { value: 7, label: "Past week" },
  { value: 14, label: "Past 2 weeks" },
  { value: 30, label: "Past month" },
  { value: 90, label: "Past 3 months" },
];
const SORTS: SortKey[] = ["fit", "newest", "oldest"];

export function Filters({
  filters,
  onChange,
  radius,
  onRadiusChange,
  showRadius,
  showSort,
  sort,
  onSortChange,
  resultCount,
  undatedHeldBack,
}: Props) {
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const set = <K extends keyof RoleFilters>(key: K, value: RoleFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <section className="filters" aria-label="Filters" data-tour="filters">
      <div className="filters__row">
        <label className="filters__search">
          <span className="sr-only">Search titles, employers and locations</span>
          <input
            type="search"
            value={filters.search}
            placeholder="Search title, employer, place…"
            onChange={(e) => set("search", e.target.value)}
          />
        </label>

        <label className="filters__field">
          <span>Where</span>
          <select value={filters.country} onChange={(e) => set("country", e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "Anywhere" : (COUNTRY_NAMES[c] ?? c)}
              </option>
            ))}
          </select>
        </label>

        <label className="filters__field">
          <span>Setting</span>
          <select value={filters.setting} onChange={(e) => set("setting", e.target.value)}>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "Any" : SETTING_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        {/* One-click remote toggle. Radiology reads from anywhere, so this is
            the filter Samia actually reaches for — a chip, not a dropdown. */}
        <div className="filters__field filters__work" role="group" aria-label="Work model" data-tour="work">
          <span>Work</span>
          {(
            [
              ["all", "Any"],
              ["remote", "Remote"],
              ["hybrid", "Hybrid"],
              ["onsite", "On-site"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`filters__work-chip${filters.workModel === value ? " filters__work-chip--on" : ""}${value === "remote" ? " filters__work-chip--remote" : ""}`}
              aria-pressed={filters.workModel === value}
              onClick={() => set("workModel", value)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="filters__field">
          <span>Posted</span>
          <select
            value={String(filters.postedWithin)}
            onChange={(e) => set("postedWithin", Number(e.target.value))}
          >
            {POSTED_WITHIN.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="filters__field">
          <span>Min fit</span>
          <select
            value={String(filters.minScore)}
            onChange={(e) => set("minScore", Number(e.target.value))}
          >
            {[0, 40, 56, 72].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "Any" : `${v}+`}
              </option>
            ))}
          </select>
        </label>

        {showSort && (
          <div className="filters__field filters__work" role="group" aria-label="Sort by">
            <span>Sort</span>
            {SORTS.map((value) => (
              <button
                key={value}
                type="button"
                className={`filters__work-chip${sort === value ? " filters__work-chip--on" : ""}`}
                aria-pressed={sort === value}
                onClick={() => onSortChange(value)}
              >
                {SORT_LABELS[value]}
              </button>
            ))}
          </div>
        )}

        <label className="filters__toggle">
          <input
            type="checkbox"
            checked={filters.newOnly}
            onChange={(e) => set("newOnly", e.target.checked)}
          />
          <span>New only</span>
        </label>

        {dirty && (
          <button type="button" className="filters__clear" onClick={() => onChange(DEFAULT_FILTERS)}>
            Clear
          </button>
        )}
      </div>

      {showRadius && (
        <div className="filters__row filters__row--radius">
          <label className="filters__radius" data-tour="radius">
            <span>
              How far apart you would accept:{" "}
              <strong className="tnum">{radius} miles</strong>
            </span>
            <input
              type="range"
              min={RADIUS_STOPS[0]}
              max={RADIUS_STOPS[RADIUS_STOPS.length - 1]}
              step={5}
              value={radius}
              list="radius-stops"
              onChange={(e) => onRadiusChange(Number(e.target.value))}
            />
            <datalist id="radius-stops">
              {RADIUS_STOPS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <p className="filters__count tnum" role="status">
            {resultCount} {resultCount === 1 ? "area" : "areas"}
          </p>
        </div>
      )}

      {!showRadius && (
        <p className="filters__count filters__count--inline tnum" role="status">
          {resultCount} {resultCount === 1 ? "post" : "posts"}
          {undatedHeldBack > 0 && (
            <span className="filters__undated">
              {" "}
              · {undatedHeldBack} more {undatedHeldBack === 1 ? "post has" : "posts have"} no date and
              {undatedHeldBack === 1 ? " is" : " are"} hidden by this filter
            </span>
          )}
        </p>
      )}
    </section>
  );
}
