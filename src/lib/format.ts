import type { Geo, Role, Setting, WorkModel } from "./types";

/** "Rochester, NY" · "Doha, Qatar" · "Remote" · "Location not stated" */
export function formatLocation(geo: Geo, fallback = "Location not stated"): string {
  if (geo.precision === "remote") return "Remote";
  const country = geo.country && geo.country !== "US" ? COUNTRY_NAMES[geo.country] : null;
  if (geo.city) {
    // US postings read "City, ST"; Gulf postings read "City, Country" — the
    // emirate or governorate is noise to anyone outside the region.
    const tail = geo.country === "US" ? geo.region : country;
    return tail ? `${geo.city}, ${tail}` : geo.city;
  }
  if (geo.region && geo.country === "US") return `${geo.region} (state-wide)`;
  if (country) return `${country} (country-wide)`;
  return geo.raw || fallback;
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  QA: "Qatar",
  AE: "UAE",
  SA: "Saudi Arabia",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
};

export const SETTING_LABELS: Record<Setting, string> = {
  academic: "Academic",
  private: "Private group",
  "hospital-employed": "Hospital-employed",
  government: "Government / VA",
  unknown: "Unspecified",
};

export const WORK_MODEL_LABELS: Record<WorkModel, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

/** "3 days ago" · "posted 2 Aug" · "date not stated" */
export function formatPosted(role: Role): string {
  if (role.ageDays == null) return "date not stated";
  if (role.ageDays === 0) return "posted today";
  if (role.ageDays === 1) return "posted yesterday";
  if (role.ageDays < 30) return `posted ${role.ageDays} days ago`;
  const months = Math.round(role.ageDays / 30);
  return `posted ${months} month${months === 1 ? "" : "s"} ago`;
}

/** "38 mi · ~1h 10m" — always framed as an estimate. */
export function formatSeparation(miles: number, driveMinutes: number | null): string {
  const m = miles < 1 ? "<1 mi" : `${Math.round(miles)} mi`;
  if (driveMinutes == null) return m;
  if (driveMinutes < 60) return `${m} · ~${driveMinutes} min`;
  const h = Math.floor(driveMinutes / 60);
  const rem = driveMinutes % 60;
  return `${m} · ~${h}h${rem ? ` ${rem}m` : ""}`;
}

/**
 * A bare "YYYY-MM-DD" is parsed by JS as UTC midnight, so rendering it in a
 * negative-offset timezone silently shows the previous day — the harvest dated
 * the 19th appeared to readers in the US as the 18th. Date-only values are
 * therefore constructed in local time; full timestamps keep their instant.
 */
export function formatRunTime(iso: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(iso);
  const d = dateOnly
    ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Trim a posting body to a readable lede without cutting mid-word. */
export function excerpt(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
