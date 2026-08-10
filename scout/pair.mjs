/**
 * Co-location engine — the reason this tool exists.
 *
 * Two attendings relocating together do not need two job boards; they need the
 * places where BOTH can work. This module finds those places, and is careful
 * about the difference between "these two jobs are genuinely commutable" and
 * "these two jobs are somewhere in the same country" — an honest board has to
 * say which one it is rather than quietly averaging them together.
 *
 * Output has two shapes:
 *   pairs  — one vascular role + one radiology role, with a real distance.
 *   metros — clusters of roles that sit inside one commutable area, which is
 *            what a couple actually evaluates ("Cleveland: 2 vascular, 3 rads").
 */

import { haversineMiles, estimatedDriveMinutes } from "./geo-math.mjs";

/** Default commutable radius. Two attendings can live between two hospitals this far apart. */
export const DEFAULT_RADIUS_MILES = 45;

/**
 * Countries small enough that "somewhere in this country" already implies a
 * shared labour market — the whole of Qatar is a 50-mile drive end to end.
 * Anywhere else, a country-level geocode says nothing about commutability.
 */
const CITY_STATE_COUNTRIES = new Set(["QA", "BH", "KW"]);

/** Display names for area labels. Mirrors COUNTRY_NAMES in src/lib/format.ts. */
const COUNTRY_LABELS = {
  QA: "Qatar",
  AE: "UAE",
  SA: "Saudi Arabia",
  KW: "Kuwait",
  BH: "Bahrain",
  OM: "Oman",
};

/** How much a pair's geographic claim can be trusted. */
const CONFIDENCE = {
  pinpoint: { key: "pinpoint", weight: 1, label: "Both locations resolved to a city" },
  countryScale: { key: "country-scale", weight: 0.85, label: "Same small country — commutable by definition" },
  approximate: { key: "approximate", weight: 0.6, label: "One or both locations only resolved to a state or country" },
};

function pairConfidence(a, b) {
  const aPin = a.geo.precision === "city";
  const bPin = b.geo.precision === "city";
  if (aPin && bPin) return CONFIDENCE.pinpoint;
  const sameSmallCountry =
    a.geo.country && a.geo.country === b.geo.country && CITY_STATE_COUNTRIES.has(a.geo.country);
  if (sameSmallCountry) return CONFIDENCE.countryScale;
  return CONFIDENCE.approximate;
}

/**
 * Harmonic mean, so a metro is only strong when BOTH sides are strong. An
 * arithmetic mean would let a 95-scoring vascular job drag a 20-scoring
 * radiology job into the top of the board, which is exactly the false positive
 * a two-body search cannot afford.
 */
function balancedMean(a, b) {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
}

/** 1 at zero miles, decaying to 0 at the radius edge. */
function proximityFactor(miles, radius) {
  if (miles == null) return 0;
  if (miles >= radius) return 0;
  return 1 - (miles / radius) ** 1.5;
}

/**
 * Build every workable vascular↔radiology pair.
 *
 * Two kinds of pair, and the difference is the whole shape of this search:
 *
 *  1. Both on-site — the classic case, gated by a real commutable distance.
 *  2. Surgeon on-site, radiologist remote — geography stops being a constraint
 *     at all. Diagnostic radiology is one of the few specialties that reads
 *     from anywhere, and vascular surgery is one of the few that cannot. That
 *     asymmetry means a single remote radiology post unlocks EVERY vascular
 *     opening in the country, which is a far larger opportunity space than
 *     physical co-location will ever produce.
 *
 * @param {Array} roles
 * @param {{radiusMiles?: number}} [opts]
 */
export function buildPairs(roles, opts = {}) {
  const radius = opts.radiusMiles ?? DEFAULT_RADIUS_MILES;
  const located = roles.filter((r) => r.geo && r.geo.lat != null && r.geo.lon != null);
  const vascular = located.filter((r) => r.specialty === "vascular");
  const radiology = located.filter((r) => r.specialty === "radiology");

  const pairs = [];

  // --- Remote-partner pairs -------------------------------------------------
  const remoteRadiology = roles.filter(
    (r) => r.specialty === "radiology" && r.workModel === "remote"
  );
  for (const v of vascular) {
    for (const r of remoteRadiology) {
      const quality = balancedMean(v.score ?? 0, r.score ?? 0);
      pairs.push({
        id: `${v.id}~${r.id}`,
        vascularId: v.id,
        radiologyId: r.id,
        miles: null,
        driveMinutes: null,
        sameOrg: false,
        remotePartner: true,
        confidence: "remote-partner",
        confidenceNote: "Radiology post is remote — the surgical job decides where you live",
        // No proximity term to earn: distance is simply not a constraint here,
        // so quality carries the score, with a premium for removing the
        // geographic problem outright.
        score: Math.round(Math.min(100, quality * 0.86 + 14)),
      });
    }
  }
  for (const v of vascular) {
    for (const r of radiology) {
      const miles = haversineMiles(v.geo, r.geo);
      if (miles == null) continue;

      const confidence = pairConfidence(v, r);
      const withinRadius = miles <= radius;
      const countryScale = confidence.key === "country-scale";
      if (!withinRadius && !countryScale) continue;

      const sameOrg = normOrg(v.org) === normOrg(r.org) && !!normOrg(v.org);
      const proximity = countryScale && !withinRadius ? 0.5 : proximityFactor(miles, radius);

      // Quality first, then how close together, then the structural bonus for
      // one employer hiring both — that is one negotiation and one relocation
      // instead of two.
      const quality = balancedMean(v.score ?? 0, r.score ?? 0);
      const score = Math.round(
        (quality * 0.62 + proximity * 100 * 0.28 + (sameOrg ? 100 : 0) * 0.1) * confidence.weight
      );

      pairs.push({
        id: `${v.id}~${r.id}`,
        vascularId: v.id,
        radiologyId: r.id,
        miles: Math.round(miles * 10) / 10,
        driveMinutes: estimatedDriveMinutes(miles),
        sameOrg,
        remotePartner: false,
        confidence: confidence.key,
        confidenceNote: confidence.label,
        score,
      });
    }
  }
  return pairs.sort((a, b) => b.score - a.score);
}

function normOrg(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|inc|llc|ltd|corp|co|company|health|healthcare|system|systems|medical|center|centre|group|hospital|university)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Greedy single-pass clustering of roles into commutable areas.
 *
 * Roles are visited best-first and each joins the first cluster whose centroid
 * it is within `radius` of, so the strongest opportunities anchor the clusters
 * rather than whichever role happened to be harvested first.
 */
export function buildMetros(roles, opts = {}) {
  const radius = opts.radiusMiles ?? DEFAULT_RADIUS_MILES;

  // The remote radiology pool is location-independent, so it applies equally to
  // every cluster rather than belonging to any one of them.
  const remotePool = roles
    .filter((r) => r.specialty === "radiology" && r.workModel === "remote")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const located = roles
    .filter((r) => r.geo && r.geo.lat != null && r.geo.lon != null)
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  /** @type {Array<{lat:number, lon:number, members:any[]}>} */
  const clusters = [];

  for (const role of located) {
    let target = null;
    let best = Infinity;
    for (const c of clusters) {
      // Country-precision roles would otherwise glue distant clusters together
      // through a national centroid, so they only join same-country clusters.
      if (role.geo.precision !== "city" && c.country && c.country !== role.geo.country) continue;
      const d = haversineMiles(role.geo, c);
      if (d != null && d <= radius && d < best) {
        best = d;
        target = c;
      }
    }
    if (!target) {
      clusters.push({
        lat: role.geo.lat,
        lon: role.geo.lon,
        country: role.geo.country,
        members: [role],
      });
      continue;
    }
    target.members.push(role);
    // Re-centre so a cluster tracks where its roles actually are.
    target.lat = target.members.reduce((s, m) => s + m.geo.lat, 0) / target.members.length;
    target.lon = target.members.reduce((s, m) => s + m.geo.lon, 0) / target.members.length;
  }

  return clusters.map((c) => summarizeMetro(c, radius, remotePool)).sort((a, b) => b.score - a.score);
}

function summarizeMetro(cluster, radius, remotePool = []) {
  const members = cluster.members;
  const vascular = members.filter((m) => m.specialty === "vascular");
  const radiology = members.filter((m) => m.specialty === "radiology");

  // Name the area after its largest pinpointed city — "Greater Cleveland"
  // reads better than the centroid's nearest hamlet.
  const anchor =
    members
      .filter((m) => m.geo.precision === "city")
      .sort((a, b) => (b.geo.population ?? 0) - (a.geo.population ?? 0))[0] ?? members[0];

  // US areas read "City, ST"; elsewhere the emirate or governorate is noise to
  // anyone outside the region, so the country is the useful qualifier.
  const qualifier =
    anchor.geo.country === "US" ? anchor.geo.region : (COUNTRY_LABELS[anchor.geo.country] ?? null);
  const label = anchor.geo.city
    ? `${anchor.geo.city}${qualifier ? `, ${qualifier}` : ""}`
    : (qualifier ?? anchor.geo.region ?? "Unknown area");

  const key = `${anchor.geo.country ?? "??"}:${(anchor.geo.region ?? "").toLowerCase()}:${(
    anchor.geo.city ?? anchor.geo.region ?? "unknown"
  )
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;

  const bestV = vascular[0]?.score ?? 0;
  const bestR = radiology[0]?.score ?? 0;
  const isTogether = vascular.length > 0 && radiology.length > 0;

  // Widest separation inside the cluster — the honest number for "how far apart
  // could these two actually end up".
  let span = 0;
  for (const v of vascular) {
    for (const r of radiology) {
      const d = haversineMiles(v.geo, r.geo);
      if (d != null && d > span) span = d;
    }
  }

  const anyApproximate = members.some((m) => m.geo.precision !== "city");

  // Depth matters beyond the best pair: a second opening on each side is a
  // fallback if one offer evaporates, and real leverage in negotiation.
  const depth = Math.min(vascular.length, radiology.length);
  const depthBonus = depth > 1 ? Math.min(12, (depth - 1) * 5) : 0;
  const sameOrg = isTogether && vascular.some((v) => radiology.some((r) => normOrg(v.org) === normOrg(r.org) && normOrg(v.org)));

  const base = isTogether ? balancedMean(bestV, bestR) : Math.max(bestV, bestR) * 0.35;
  const score = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        base * 0.72 +
          proximityFactor(span, radius) * 100 * 0.18 +
          depthBonus +
          (sameOrg ? 8 : 0) -
          (anyApproximate ? 6 : 0)
      )
    )
  );

  // A metro with a surgical opening but no local radiology is still fully
  // workable if she reads remotely — so it is a real option, not a near miss.
  const remoteUnlocked = !isTogether && vascular.length > 0 && remotePool.length > 0;
  const bestRemote = remotePool[0]?.score ?? 0;
  const remoteScore = remoteUnlocked
    ? Math.round(Math.min(100, balancedMean(bestV, bestRemote) * 0.8 + (depthBonus ? 4 : 0)))
    : 0;

  return {
    key,
    label,
    country: anchor.geo.country ?? null,
    region: anchor.geo.region ?? null,
    lat: Math.round(cluster.lat * 1e4) / 1e4,
    lon: Math.round(cluster.lon * 1e4) / 1e4,
    isTogether,
    vascularIds: vascular.map((v) => v.id),
    radiologyIds: radiology.map((r) => r.id),
    vascularCount: vascular.length,
    radiologyCount: radiology.length,
    bestVascularScore: bestV,
    bestRadiologyScore: bestR,
    spanMiles: Math.round(span * 10) / 10,
    spanDriveMinutes: estimatedDriveMinutes(span),
    sameOrg,
    approximate: anyApproximate,
    score: remoteUnlocked ? Math.max(score, remoteScore) : score,
    /** Which side is missing, so a one-sided metro can still be actioned. */
    missingSide: isTogether ? null : vascular.length ? "radiology" : "vascular",
    /**
     * True when the surgeon has a post here and the radiologist could take one
     * of the remote posts. Kept separate from `isTogether` so the board never
     * implies two people are physically working in the same place when one of
     * them is reading from home.
     */
    remoteUnlocked,
    remotePartnerCount: remoteUnlocked ? remotePool.length : 0,
    bestRemoteRadiologyScore: remoteUnlocked ? bestRemote : 0,
  };
}
