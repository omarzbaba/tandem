/**
 * Offline geocoder for job-posting location strings.
 *
 * Postings write location a dozen different ways ("Rochester, NY", "Rochester,
 * New York, United States", "Doha", "Multiple Locations", "Remote - US"). The
 * co-location engine is only as good as this resolver, so it degrades in
 * explicit, labelled steps — city → region → country → unknown — and every
 * result carries the precision it was resolved at. A pair built on two
 * country-level centroids is not a real 40-mile commute, and downstream code
 * has to be able to tell.
 *
 * Deliberately offline: no geocoding API means no key, no rate limit, and
 * identical output in CI and on a laptop.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Re-exported so Node-side callers have one import for all geo helpers, while
// the browser pulls the same maths straight from geo-math.mjs.
export { haversineMiles, estimatedDriveMinutes } from "./geo-math.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @typedef {"city" | "region" | "country" | "remote" | "none"} Precision */

/**
 * @typedef {object} Geo
 * @property {number | null} lat
 * @property {number | null} lon
 * @property {string | null} city
 * @property {string | null} region   State postal code (US) or emirate/governorate.
 * @property {string | null} country  ISO-3166 alpha-2.
 * @property {Precision} precision
 * @property {string} raw
 */

const US_STATES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "puerto rico": "PR", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const US_STATE_CODES = new Set(Object.values(US_STATES));

const COUNTRY_NAMES = {
  "united states": "US", "united states of america": "US", usa: "US", "u s a": "US",
  america: "US", us: "US",
  qatar: "QA", "state of qatar": "QA",
  "united arab emirates": "AE", uae: "AE", emirates: "AE", "u a e": "AE",
  "saudi arabia": "SA", "kingdom of saudi arabia": "SA", ksa: "SA", saudi: "SA",
  kuwait: "KW", "state of kuwait": "KW",
  bahrain: "BH", "kingdom of bahrain": "BH",
  oman: "OM", "sultanate of oman": "OM",
};

/**
 * Names that canonicalisation alone cannot reconcile — borough-to-city,
 * abbreviations postings use that GeoNames does not, and Arabic
 * transliterations that differ by more than the definite article.
 * Keys are already canonical (see `canon`).
 */
const CITY_ALIASES = {
  nyc: "New York City", manhattan: "New York City", brooklyn: "New York City",
  "the bronx": "New York City", queens: "New York City", "staten island": "New York City",
  "washington dc": "Washington", "washington d c": "Washington", dc: "Washington",
  philly: "Philadelphia", "the woodlands": "Houston",
  makkah: "Mecca", madinah: "Medina", "al madinah": "Medina",
  jiddah: "Jeddah", "ad dammam": "Dammam", "al hasa": "Hofuf", "al ahsa": "Hofuf",
  "umm al quwain": "Umm al Qaywayn", "sharjah city": "Sharjah",
  "al kuwait": "Kuwait City", "kuwait": "Kuwait City",
};

/**
 * Canonical lookup key. Applied to BOTH the gazetteer index and the query, so
 * "St. Louis"/"Saint Louis" and "Ras Al Khaimah"/"Ras al-Khaimah" collapse to
 * the same string instead of relying on an exhaustive alias table.
 */
function canon(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'`‘’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bst\b/g, "saint")
    .replace(/\bmt\b/g, "mount")
    .replace(/\bft\b/g, "fort")
    .replace(/\s+/g, " ")
    .trim();
}

/** Arabic definite article, including sun-letter assimilation (Ar Rayyan, Ad Dawhah). */
const ARABIC_ARTICLE_RE = /^(al|ar|as|ad|at|az|an|el)\s+/;

/**
 * Every key a place should be findable under. Generating the same variants for
 * the index and the query is what makes "Al Khobar" find GeoNames' "Khobar".
 */
function keyVariants(s) {
  const base = canon(s);
  if (!base) return [];
  const out = new Set();
  const add = (v) => v && out.add(v);
  const spread = (v) => {
    add(v);
    add(v.replace(/\s+city$/, ""));
    add(v.replace(ARABIC_ARTICLE_RE, ""));
    add(v.replace(ARABIC_ARTICLE_RE, "").replace(/\s+city$/, ""));
  };
  spread(base);
  const aliased = CITY_ALIASES[base];
  if (aliased) spread(canon(aliased));
  return [...out];
}

const REMOTE_RE =
  /\b(remote|telecommut|work from home|wfh|virtual|teleradiolog|home[- ]based|anywhere)\b/i;

/** Boilerplate that carries no geographic signal. */
const NOISE_RE =
  /\b(multiple locations|various locations|nationwide|us wide|united states wide|flexible|tbd|to be determined|n\/a|not specified|confidential)\b/i;

let cache = null;

function load() {
  if (cache) return cache;
  const raw = JSON.parse(readFileSync(resolve(ROOT, "geo/gazetteer.json"), "utf8"));

  // Index by "city|region" and by bare city, under every canonical variant.
  // Places arrive population-descending and the first writer wins, so an
  // ambiguous bare name ("Springfield") resolves to the largest one.
  const byCityRegion = new Map();
  const byCity = new Map();
  for (const p of raw.places) {
    const region = canon(p.r ?? "");
    for (const key of keyVariants(p.n)) {
      if (!byCityRegion.has(`${key}|${region}`)) byCityRegion.set(`${key}|${region}`, p);
      if (!byCity.has(key)) byCity.set(key, p);
    }
    for (const alias of p.a ?? []) {
      for (const key of keyVariants(alias)) {
        if (!byCity.has(key)) byCity.set(key, p);
      }
    }
  }
  cache = { places: raw.places, centroids: raw.centroids, byCityRegion, byCity };
  return cache;
}

/** Strip punctuation and diacritics so "Al-Khobar" and "Al Khobar" agree. */
function clean(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s,;/&()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function empty(raw, precision = "none") {
  return { lat: null, lon: null, city: null, region: null, country: null, precision, raw };
}

function fromPlace(place, raw) {
  return {
    lat: place.lat,
    lon: place.lon,
    city: place.n,
    region: place.r || null,
    country: place.c,
    // Carried through so the metro clusterer can name an area after its
    // largest city rather than its geometric centre.
    population: place.p,
    precision: "city",
    raw,
  };
}

/**
 * Resolve one location string.
 *
 * Postings that list several sites ("Cleveland, OH; Akron, OH") resolve to the
 * first, which is nearly always the primary site — but the caller can split on
 * `;` first if it wants all of them as separate roles.
 *
 * @param {string} input
 * @returns {Geo}
 */
export function geocode(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return empty(raw);

  const isRemote = REMOTE_RE.test(raw);

  // "Remote - Chicago, IL" still has a real anchor; pure "Remote" does not.
  const stripped = clean(raw.replace(REMOTE_RE, " ").replace(NOISE_RE, " "));
  if (!stripped) return isRemote ? empty(raw, "remote") : empty(raw);

  const { byCityRegion, byCity, centroids } = load();

  // Take the first site when several are listed.
  const primary = stripped.split(/[;/]|\s+\bor\b\s+/i)[0].trim();
  const parts = primary.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return isRemote ? empty(raw, "remote") : empty(raw);

  // Identify a trailing country, then a trailing US state, working right to left.
  let country = null;
  let region = null;
  const tail = [...parts];

  const lastTok = canon(tail[tail.length - 1]);
  if (tail.length > 1 && COUNTRY_NAMES[lastTok]) {
    country = COUNTRY_NAMES[lastTok];
    tail.pop();
  }

  if (tail.length > 1) {
    const t = canon(tail[tail.length - 1]);
    const upper = tail[tail.length - 1].toUpperCase().replace(/[^A-Z]/g, "");
    if (US_STATES[t]) {
      region = US_STATES[t];
      country ??= "US";
      tail.pop();
    } else if (US_STATE_CODES.has(upper) && upper.length === 2) {
      region = upper;
      country ??= "US";
      tail.pop();
    }
  }

  // 1. A lone token that names a state or country is NOT a city, even when a
  //    same-named city exists. "Texas" must not resolve to Texas City, TX —
  //    claiming city precision here would let the pair engine assert a commute
  //    between two postings that only share a state.
  if (!country && !region && parts.length === 1) {
    const t = canon(parts[0]);
    const upper = parts[0].toUpperCase().replace(/[^A-Z]/g, "");
    if (US_STATES[t]) {
      const r = US_STATES[t];
      const c = centroids[`US:${r}`];
      if (c) return { ...c, city: null, region: r, country: "US", precision: "region", raw };
    }
    if (US_STATE_CODES.has(upper) && upper.length === 2) {
      const c = centroids[`US:${upper}`];
      if (c) return { ...c, city: null, region: upper, country: "US", precision: "region", raw };
    }
    if (COUNTRY_NAMES[t]) {
      const cc = COUNTRY_NAMES[t];
      const c = centroids[cc];
      if (c) return { ...c, city: null, region: null, country: cc, precision: "country", raw };
    }
  }

  const cityKeys = keyVariants(tail.join(" "));

  // 2. City + region is the only unambiguous form.
  if (region) {
    const r = canon(region);
    for (const key of cityKeys) {
      const hit = byCityRegion.get(`${key}|${r}`);
      if (hit) return fromPlace(hit, raw);
    }
  }

  // 3. Bare city — but ONLY when the posting never named a region.
  //
  //    If it said "Danville, PA" and no Danville exists in the Pennsylvania
  //    index, the answer is "somewhere in Pennsylvania", never "Danville,
  //    California". Falling back across regions here produced exactly the
  //    confident-but-wrong pin this module exists to avoid: it put Geisinger's
  //    Danville PA campus on the wrong coast and clustered it with a Wisconsin
  //    job into a fictitious California metro.
  if (!region) {
    for (const key of cityKeys) {
      const hit = byCity.get(key);
      if (hit && (!country || hit.c === country)) return fromPlace(hit, raw);
    }
  }

  // 4. Region centroid — good enough to bucket a role, never good enough to
  //    claim two jobs are commutable.
  if (country && region) {
    const c = centroids[`${country}:${region}`];
    if (c) return { ...c, city: null, region, country, precision: "region", raw };
  }
  if (country) {
    const c = centroids[country];
    if (c) return { ...c, city: null, region: null, country, precision: "country", raw };
  }

  return isRemote ? empty(raw, "remote") : empty(raw);
}


/** Precision levels that describe a real, specific place. */
export function isPinpoint(geo) {
  return geo?.precision === "city";
}
