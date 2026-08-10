/**
 * Fit scoring for a single role, from the perspective of one of the two
 * candidates.
 *
 * Scores are 0–100 and deliberately explainable: every point added or removed
 * comes back as a reason string that the UI shows, so the board can be argued
 * with rather than just believed. Weights live in one table per specialty so
 * they can be tuned without touching the logic.
 */

/** @typedef {"vascular" | "radiology"} Specialty */

const TIER_CUTOFFS = [
  { min: 72, tier: "strong" },
  { min: 56, tier: "worth-a-look" },
  { min: 40, tier: "stretch" },
  { min: 0, tier: "low" },
];

/**
 * Dimension weights sum to 100. Vascular surgery and diagnostic radiology have
 * genuinely different job markets — call volume and partnership economics drive
 * radiology, case mix and call burden drive vascular — so they are scored with
 * different emphases rather than one shared rubric.
 */
const RUBRIC = {
  vascular: {
    specialtyFit: 34,
    seniority: 16,
    practiceQuality: 18,
    location: 14,
    recency: 10,
    signal: 8,
  },
  radiology: {
    specialtyFit: 34,
    seniority: 14,
    practiceQuality: 20,
    location: 14,
    recency: 10,
    signal: 8,
  },
};

const VASCULAR_POSITIVE = [
  { re: /\bopen (?:and |& )?endovascular\b/i, pts: 1.0, why: "open + endovascular case mix" },
  { re: /\baort(?:ic|a)\b|\bEVAR\b|\bTEVAR\b|\bfenestrated\b/i, pts: 0.9, why: "complex aortic work" },
  { re: /\blimb salvage\b|\bcritical limb\b|\bCLTI\b|\bPAD\b/i, pts: 0.7, why: "limb salvage / PAD volume" },
  { re: /\bdialysis access\b|\bAV fistula\b/i, pts: 0.4, why: "dialysis access volume" },
  { re: /\bhybrid (?:or|operating room|suite)\b/i, pts: 0.6, why: "hybrid OR available" },
  { re: /\bvein\b|\bvenous\b|\bvaricose\b/i, pts: 0.3, why: "venous practice component" },
  { re: /\bcall (?:is )?(?:1:[4-9]|1:1[0-9])\b|\bfavorable call\b|\blight call\b/i, pts: 0.7, why: "favorable call ratio" },
];

const RADIOLOGY_POSITIVE = [
  { re: /\bgeneral (?:diagnostic )?radiolog/i, pts: 1.0, why: "general diagnostic scope" },
  { re: /\bbody imaging\b|\bcross[- ]sectional\b|\bCT\b.*\bMR/i, pts: 0.8, why: "body / cross-sectional emphasis" },
  { re: /\bno (?:overnight |night )?call\b|\bnight ?hawk covered\b|\bcall covered\b/i, pts: 0.9, why: "call covered or none" },
  { re: /\b(?:\d+|ten|twelve|thirteen|fourteen)\s*(?:\+)?\s*weeks? (?:of )?vacation\b/i, pts: 0.7, why: "stated vacation weeks" },
  { re: /\bpartnership track\b|\bpartner(?:ship)? in \d\b/i, pts: 0.9, why: "partnership track" },
  { re: /\bsubspecialt(?:y|ies) (?:supported|protected)\b|\bfellowship[- ]trained welcome\b/i, pts: 0.5, why: "subspecialty support" },
  { re: /\bhome workstation\b|\bremote reading\b|\bhybrid reading\b/i, pts: 0.6, why: "home workstation / hybrid reading" },
];

const NEGATIVE = [
  { re: /\bsolo (?:coverage|practice|radiologist|surgeon)\b/i, pts: -1.0, why: "solo coverage" },
  { re: /\b1:2\b|\bq2 call\b|\bevery other (?:night|weekend)\b/i, pts: -1.2, why: "heavy call (q2)" },
  { re: /\bno partnership\b|\bemployed model only\b/i, pts: -0.4, why: "no partnership path" },
  { re: /\bJ-?1 (?:only|required)\b/i, pts: -0.5, why: "J-1 restricted" },
  { re: /\bmust (?:also )?cover (?:pediatric|peds) (?:trauma|call)\b/i, pts: -0.3, why: "added pediatric call burden" },
];

/** Gulf licensure gates worth surfacing rather than scoring away. */
const GULF_LICENSURE = {
  QA: "QCHP licensure (Qatar Council for Healthcare Practitioners)",
  AE: "DOH Abu Dhabi / DHA Dubai / MOHAP licensure",
  SA: "SCFHS classification + registration",
  KW: "Kuwait MOH licensure",
  BH: "NHRA licensure",
  OM: "Oman Medical Specialty Board / MOH licensure",
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Days since posting, or null when the source gave no date. Undated postings
 * are common on society boards and are treated as neutral-minus rather than
 * penalised as if they were stale.
 */
function ageDays(datePosted, today) {
  if (!datePosted) return null;
  const t = Date.parse(datePosted);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.parse(today) - t) / 86_400_000));
}

/**
 * @param {object} role      Normalized role (title, org, description, geo, classification…)
 * @param {Specialty} specialty
 * @param {{today: string, preferredCountries?: string[]}} ctx
 */
export function scoreRole(role, specialty, ctx) {
  const w = RUBRIC[specialty];
  const text = `${role.title ?? ""} ${role.description ?? ""}`;
  const reasons = [];
  const concerns = [];

  // --- Specialty fit -------------------------------------------------------
  let fit = 0.55; // a correctly-classified attending posting starts mid-band
  const positives = specialty === "vascular" ? VASCULAR_POSITIVE : RADIOLOGY_POSITIVE;
  for (const p of positives) {
    if (p.re.test(text)) {
      fit += p.pts * 0.12;
      reasons.push(p.why);
    }
  }
  // The wife reads diagnostic, so an IR-only posting is a genuine mismatch —
  // kept on the board (it signals a hiring department) but scored honestly.
  if (specialty === "radiology" && role.isInterventional && !/\bIR\/DR\b|\bdiagnostic\b/i.test(text)) {
    fit -= 0.3;
    concerns.push("interventional-only — outside a diagnostic/general practice");
  }
  for (const n of NEGATIVE) {
    if (n.re.test(text)) {
      fit += n.pts * 0.12;
      concerns.push(n.why);
    }
  }
  const specialtyFit = clamp(fit, 0, 1);

  // --- Seniority -----------------------------------------------------------
  let sen = 0.6;
  if (role.isLeadership) {
    sen = 0.95;
    reasons.push("leadership scope (chief / director / division head)");
  }
  if (/\bentry[- ]level\b|\bjunior\b|\bnew grad/i.test(text)) {
    sen = 0.35;
    concerns.push("pitched at entry level");
  }
  if (role.isLocum) {
    sen = 0.25;
    concerns.push("locum / temporary, not a permanent post");
  }

  // --- Practice quality ----------------------------------------------------
  let quality = 0.55;
  if (role.setting === "academic") {
    quality = 0.75;
    reasons.push("academic setting");
  } else if (role.setting === "private") {
    quality = 0.72;
    reasons.push("private / group practice");
  } else if (role.setting === "government") {
    quality = 0.6;
    reasons.push("government / VA employment");
  }
  if (/\blevel (?:i|1|one) trauma\b/i.test(text)) {
    quality += 0.1;
    reasons.push("Level I trauma centre");
  }
  if (/\bmagnet\b|\btop \d+ hospital\b|\bnationally ranked\b/i.test(text)) {
    quality += 0.05;
  }
  quality = clamp(quality, 0, 1);

  // --- Location ------------------------------------------------------------
  const preferred = new Set(ctx.preferredCountries ?? ["US", "QA", "AE", "SA", "KW", "BH", "OM"]);
  let location = preferred.has(role.geo?.country) ? 0.7 : 0.3;
  if (role.geo?.precision === "city") location += 0.15;
  else concerns.push("location is vague — resolved only to a state or country");
  if (role.workModel === "remote") reasons.push("remote / teleradiology");
  const licensure = GULF_LICENSURE[role.geo?.country];
  if (licensure) concerns.push(`Requires ${licensure}`);
  location = clamp(location, 0, 1);

  // --- Recency -------------------------------------------------------------
  const age = ageDays(role.datePosted, ctx.today);
  let recency;
  if (age == null) recency = 0.5;
  else if (age <= 14) {
    recency = 1;
    reasons.push("posted within two weeks");
  } else if (age <= 45) recency = 0.75;
  else if (age <= 90) recency = 0.45;
  else {
    recency = 0.15;
    concerns.push(`posting is ${age} days old`);
  }

  // --- Signal quality ------------------------------------------------------
  // How much the posting actually tells you. A three-line stub is not a
  // reliable basis for a relocation decision, whatever it scores elsewhere.
  const len = (role.description ?? "").length;
  const signal = clamp(len / 1800, 0.15, 1);
  if (len < 300) concerns.push("thin posting — little detail to evaluate");

  const total =
    specialtyFit * w.specialtyFit +
    sen * w.seniority +
    quality * w.practiceQuality +
    location * w.location +
    recency * w.recency +
    signal * w.signal;

  const score = Math.round(clamp(total, 0, 100));

  return {
    score,
    tier: TIER_CUTOFFS.find((t) => score >= t.min).tier,
    subscores: {
      specialtyFit: Math.round(specialtyFit * w.specialtyFit),
      seniority: Math.round(sen * w.seniority),
      practiceQuality: Math.round(quality * w.practiceQuality),
      location: Math.round(location * w.location),
      recency: Math.round(recency * w.recency),
      signal: Math.round(signal * w.signal),
    },
    reasons: [...new Set(reasons)],
    concerns: [...new Set(concerns)],
    ageDays: age,
  };
}

export const RUBRIC_DIMS = [
  { key: "specialtyFit", label: "Specialty fit" },
  { key: "seniority", label: "Seniority" },
  { key: "practiceQuality", label: "Practice" },
  { key: "location", label: "Location" },
  { key: "recency", label: "Recency" },
  { key: "signal", label: "Detail" },
];

export { RUBRIC, TIER_CUTOFFS };
