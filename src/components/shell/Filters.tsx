import type { RoleFilters } from "../roles/RoleList";
import { DEFAULT_FILTERS } from "../roles/RoleList";
import { COUNTRY_NAMES, SETTING_LABELS } from "../../lib/format";
import "./filters.css";

interface Props {
  filters: RoleFilters;
  onChange: (f: RoleFilters) => void;
  radius: number;
  onRadiusChange: (r: number) => void;
  showRadius: boolean;
  resultCount: number;
}

const COUNTRIES = ["all", "US", "QA", "AE", "SA", "KW", "BH", "OM"];
const SETTINGS = ["all", "academic", "private", "hospital-employed", "government"] as const;
const RADIUS_STOPS = [15, 30, 45, 60, 90, 120];

export function Filters({
  filters,
  onChange,
  radius,
  onRadiusChange,
  showRadius,
  resultCount,
}: Props) {
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const set = <K extends keyof RoleFilters>(key: K, value: RoleFilters[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <section className="filters" aria-label="Filters">
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
        <div className="filters__field filters__work" role="group" aria-label="Work model">
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
          <label className="filters__radius">
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
        </p>
      )}
    </section>
  );
}
