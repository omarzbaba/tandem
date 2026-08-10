/**
 * Raw posting → scored, located, deduplicated role.
 *
 * Two jobs here that are easy to get wrong:
 *  1. Finding a location at all. Society RSS feeds and Workday summaries often
 *     ship no location field, and the place name is sitting in the title.
 *  2. Deduplication. The same job legitimately appears on a society board, an
 *     aggregator, and the employer's own ATS. Collapsing those three into one
 *     row — while keeping the employer's own link as the canonical one — is
 *     what stops the board reading as three separate opportunities.
 */

import { geocode } from "./geocode.mjs";
import { classify, isRelevant } from "./classify.mjs";
import { scoreRole } from "./score.mjs";

/**
 * "City, ST" anywhere in a body. Society and specialty-board RSS feeds carry no
 * location field at all — the place is written into the prose — and without
 * this the majority of the board cannot be placed on a map, which means it
 * cannot be co-located either.
 */
const US_STATE_NAMES =
  "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming";

const LOOSE_US_PLACE_RE = new RegExp(
  "\\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,2}),\\s*(" +
    "A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|P[AR]|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]" +
    "|" + US_STATE_NAMES +
    ")\\b",
  "g"
);

/**
 * A bare city name with no state ("Greater Seattle Area", "onsite in Orlando").
 * Only cities large enough to be unambiguous are accepted — matching every
 * gazetteer entry would turn common words into places.
 */
const BARE_CITY_MIN_POPULATION = 250_000;
const BARE_CITY_CANDIDATE_RE = /\b([A-Z][a-z]{3,}(?: [A-Z][a-z]{3,})?)\b/g;

/** Gulf cities worth spotting in prose, where "City, Country" is rarely written. */
const GULF_PLACE_RE =
  /\b(Doha|Al Rayyan|Ar Rayyan|Al Wakrah|Abu Dhabi|Dubai|Sharjah|Al Ain|Ajman|Fujairah|Ras Al Khaimah|Umm Al Quwain|Riyadh|Jeddah|Dammam|Al Khobar|Khobar|Dhahran|Mecca|Makkah|Medina|Madinah|Tabuk|Abha|Hofuf|Al Ahsa|Kuwait City|Manama|Muscat|Salalah)\b/;

/**
 * Infer a location from free text, validating every candidate against the
 * gazetteer instead of trusting the regex. A pattern match that does not
 * resolve to a real city is discarded, so "Board Certified, MD" cannot become
 * a place.
 */
function inferLocationFromText(text) {
  if (!text) return "";
  const window = text.slice(0, 3000);

  const gulf = window.match(GULF_PLACE_RE);
  if (gulf && geocode(gulf[1]).precision === "city") return gulf[1];

  for (const m of window.matchAll(LOOSE_US_PLACE_RE)) {
    const candidate = `${m[1]}, ${m[2]}`;
    if (geocode(candidate).precision === "city") return candidate;
  }

  // Bare major city, checked against the gazetteer's population figure so only
  // unambiguous names qualify.
  for (const m of window.matchAll(BARE_CITY_CANDIDATE_RE)) {
    const g = geocode(m[1]);
    if (g.precision === "city" && (g.population ?? 0) >= BARE_CITY_MIN_POPULATION) {
      return m[1];
    }
  }
  return "";
}

/**
 * Practice names an RSS title tends to lead with ("Irving Radiology — Day Shift
 * Teleradiologist"). Only accepted when the leading phrase actually looks like
 * an organisation, because the alternative — labelling 350 postings with the
 * name of the job board they came from — is actively misleading and destroys
 * the same-employer signal the co-location engine depends on.
 */
const ORG_WORD_RE =
  /\b(radiology|imaging|health|healthcare|medical|medicine|associates|group|partners|clinic|hospital|institute|centre|center|surgical|surgery|physicians|specialists|consultants|solutions|services|care|system|network|university|college)\b/i;

/**
 * A head that is only a specialty name ("Diagnostic Radiology", "Breast
 * Imaging") is describing the job, not the employer.
 */
const SPECIALTY_ONLY_HEAD_RE =
  /^(?:diagnostic|general|body|breast|neuro|musculoskeletal|msk|interventional|pediatric|paediatric|nuclear|emergency|abdominal|thoracic|cardiothoracic|vascular|women'?s)?\s*(?:radiology|imaging|surgery|medicine|teleradiology)$/i;

/** Marketing headlines and job descriptors that precede a colon or pipe. */
const NOT_AN_ORG_HEAD_RE =
  /^(?:build|join|earn|lead|become|make|discover|explore|work|start|apply|seeking|now hiring|hiring|urgent|new|up to|\$|\d)/i;

function inferOrgFromTitle(title) {
  const t = String(title ?? "").trim();
  const m = t.match(/^([^:|–—]{3,60}?)\s*[:|–—]\s*(.+)$/);
  if (!m) return "";

  // Drop a trailing "(City, ST)" — that is a location, not part of the name.
  const head = m[1].replace(/\s*\([^)]*\)\s*$/, "").trim();

  if (!ORG_WORD_RE.test(head)) return "";
  if (SPECIALTY_ONLY_HEAD_RE.test(head)) return "";
  if (NOT_AN_ORG_HEAD_RE.test(head)) return "";
  if (/\b(radiologist|surgeon|physician|opportunity|position|opening|wanted|needed|locum|call|bonus|salary|partnership)\b/i.test(head)) {
    return "";
  }

  // A real practice name carries either a distinctive word ("Select Radiology
  // Solutions") or an entity noun ("Radiology Associates Imaging"). A string of
  // pure specialty terms — "Radiology - MSK or Body Imaging" — carries neither,
  // and inventing an employer from it is worse than admitting there isn't one.
  const distinctive = head
    .split(/[\s\-–—]+/)
    .filter((w) => /^[A-Z]/.test(w) && !GENERIC_ORG_TOKENS.has(w.toLowerCase().replace(/[^a-z]/g, "")));
  if (!distinctive.length && !ENTITY_NOUN_RE.test(head)) return "";

  return head;
}

/** Words that describe a specialty or a modality rather than name a practice. */
const GENERIC_ORG_TOKENS = new Set([
  "radiology", "radiological", "imaging", "diagnostic", "general", "body", "breast",
  "neuro", "neuroradiology", "msk", "musculoskeletal", "interventional", "nuclear",
  "emergency", "abdominal", "thoracic", "cardiothoracic", "vascular", "surgery",
  "surgical", "medicine", "medical", "health", "healthcare", "care", "teleradiology",
  "hybrid", "remote", "onsite", "womens", "women", "pediatric", "paediatric",
  "and", "or", "the", "of", "for", "with", "at", "in",
]);

/** Nouns that mark a legal or trading entity. */
const ENTITY_NOUN_RE =
  /\b(associates|group|partners|solutions|services|consultants|specialists|network|institute|clinic|hospital|centre|center|physicians|systems?|university|college|pa|pc|llc|llp|inc)\b/i;

/** "Vascular Surgeon — Rochester, NY" / "Radiologist (Doha, Qatar)" */
const TITLE_LOCATION_RE =
  /[–—-]\s*([A-Z][A-Za-z.'\- ]+,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)*))\s*$|\(([^)]+,\s*[^)]+)\)\s*$/;

/**
 * "Location: Doha, Qatar" anywhere in the body.
 *
 * The keyword is matched case-insensitively but the captured place must still
 * start with a capital, so a sentence like "based in a busy tertiary centre"
 * cannot be mistaken for an address. That rules out a plain `i` flag, which
 * would relax the capture too.
 */
const BODY_LOCATION_RE =
  /(?:[Ll]ocation|[Ll]ocated in|[Bb]ased in|[Pp]osition location|[Ww]ork location|[Cc]ity)\s*[:\-]\s*([A-Z][A-Za-z.'\- ]+,\s*[A-Za-z.'\- ]+)/;

/** Location fields that are present but say nothing. */
const PLACEHOLDER_LOCATION_RE =
  /^(various|various locations|multiple|multiple locations|see posting|n\/?a|tbd|-+)$/i;

/**
 * Best-effort location string for a posting, preferring explicit fields and
 * falling back to text extraction. Returns "" when nothing is found — better an
 * unlocated role, visibly flagged, than a confidently wrong pin on a map.
 */
export function extractLocation(posting) {
  const explicit = String(posting.location ?? "").trim();
  const explicitIsUseful = explicit && !PLACEHOLDER_LOCATION_RE.test(explicit);
  if (explicitIsUseful) return explicit;

  const title = String(posting.title ?? "");
  const m = title.match(TITLE_LOCATION_RE);
  if (m) return (m[1] ?? m[2] ?? "").trim();

  const body = String(posting.description ?? "").slice(0, 4000);
  const b = body.match(BODY_LOCATION_RE);
  if (b) return b[1].trim();

  // Last resort: a gazetteer-validated place name anywhere in the prose.
  const inferred = inferLocationFromText(`${title}\n${body}`);
  if (inferred) return inferred;

  // Never fall back to a placeholder — it would geocode to nothing anyway and
  // would show up in the UI as if it were a real location.
  return "";
}

/** Title with a trailing location fragment removed, so cards read cleanly. */
function cleanTitle(title) {
  return String(title ?? "")
    .replace(TITLE_LOCATION_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s–—-]+$/, "")
    .trim();
}

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Employer-ish key: drops the corporate boilerplate that varies by source. */
function normOrg(s) {
  return norm(s).replace(
    /\b(the|inc|llc|ltd|corp|co|company|health|healthcare|system|systems|medical|center|centre|group|hospital|university|clinic|associates|partners)\b/g,
    " "
  ).replace(/\s+/g, " ").trim();
}

/**
 * Dedup key. City is included deliberately: the same title at two sites in one
 * system is two real jobs, not a duplicate.
 */
export function fingerprintOf(org, title, city) {
  return `${normOrg(org)}::${norm(title)}::${norm(city ?? "")}`;
}

/** Employer ATS links beat aggregator redirects when the same job appears twice. */
function sourceRank(src) {
  const kind = src?.category;
  if (kind === "health-system" || kind === "academic" || kind === "specialty-group") return 3;
  if (kind === "society-board") return 2;
  if (kind === "aggregator" || kind === "recruiter") return 1;
  return 0;
}

/**
 * @param {Array<{source: object, postings: Array}>} harvested
 * @param {{today: string, preferredCountries?: string[]}} ctx
 */
export function normalizeAll(harvested, ctx) {
  /** @type {Map<string, any>} */
  const byFingerprint = new Map();
  const stats = { raw: 0, irrelevant: 0, unlocated: 0, duplicates: 0 };

  for (const { source, postings } of harvested) {
    for (const posting of postings) {
      stats.raw++;

      // Location is resolved first so the classifier can use it: a location
      // field of exactly "Remote" settles the work model on its own.
      const locationText = extractLocation(posting);

      const classified = classify({
        title: posting.title,
        description: posting.description,
        department: posting.department,
        org: posting.org || source.name,
        location: locationText,
      });
      if (!isRelevant(classified)) {
        stats.irrelevant++;
        continue;
      }

      // A remote job has no location by nature. Recording that as "we could not
      // place it" would overstate the coverage gap in the run report and hide
      // the real failures among the teleradiology posts.
      const geo = geocode(locationText);
      if (geo.precision === "none" && classified.workModel === "remote") {
        geo.precision = "remote";
      }
      if (geo.lat == null && geo.precision !== "remote") stats.unlocated++;

      // An RSS board supplies no employer. Infer one from the title when it
      // plainly names a practice, otherwise leave it blank — the UI says
      // "employer not stated" rather than passing the job board off as the
      // employer, which would also collapse unrelated jobs onto one fingerprint.
      const suppliedOrg = String(posting.org ?? "").trim();
      const boardIsNotEmployer = !suppliedOrg || suppliedOrg === source.name;
      const org = boardIsNotEmployer
        ? inferOrgFromTitle(posting.title) || (source.category === "aggregator" || source.category === "society-board" ? "" : suppliedOrg)
        : suppliedOrg;

      // When the employer was read out of the title, drop it from the title so
      // the card does not print the practice name twice.
      const rawTitle =
        org && boardIsNotEmployer
          ? String(posting.title ?? "").replace(
              new RegExp(`^\\s*${org.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\([^)]*\\))?\\s*[:|–—]\\s*`),
              ""
            )
          : posting.title;
      const title = cleanTitle(rawTitle);
      // With no employer, the posting URL is the only thing that distinguishes
      // two same-titled jobs, so it stands in for the org in the dedup key.
      const fingerprint = org
        ? fingerprintOf(org, title, geo.city)
        : fingerprintOf(`url:${posting.url}`, title, geo.city);

      const role = {
        id: fingerprint,
        fingerprint,
        title,
        org,
        specialty: classified.specialty,
        isInterventional: classified.isInterventional,
        isLeadership: classified.isLeadership,
        isLocum: classified.isLocum,
        setting: classified.setting,
        workModel: classified.workModel,
        locationText,
        geo,
        url: posting.url,
        datePosted: posting.datePosted ? isoOrNull(posting.datePosted) : null,
        // Trimmed for the committed payload: the drawer shows an excerpt and the
        // full text is one click away at the source. Scoring already ran on the
        // untruncated body above.
        description: String(posting.description ?? "").slice(0, 1500),
        source: { name: source.name, url: source.url, category: source.category },
        _rank: sourceRank(source),
      };

      const scored = scoreRole(role, classified.specialty, ctx);
      Object.assign(role, {
        score: scored.score,
        tier: scored.tier,
        subscores: scored.subscores,
        reasons: scored.reasons,
        concerns: scored.concerns,
        ageDays: scored.ageDays,
      });

      const existing = byFingerprint.get(fingerprint);
      if (!existing) {
        byFingerprint.set(fingerprint, { ...role, alsoSeenOn: [] });
        continue;
      }

      stats.duplicates++;
      // Keep the better-ranked source as canonical, but never lose the fact
      // that the job was cross-posted — that is a real signal of an active search.
      const alsoSeenOn = [...existing.alsoSeenOn, existing.source, role.source].filter(
        (s, i, arr) => arr.findIndex((x) => x.name === s.name) === i && s.name !== undefined
      );
      const winner =
        role._rank > existing._rank || (role._rank === existing._rank && role.score > existing.score)
          ? role
          : existing;
      byFingerprint.set(fingerprint, {
        ...winner,
        alsoSeenOn: alsoSeenOn.filter((s) => s.name !== winner.source.name),
      });
    }
  }

  const roles = [...byFingerprint.values()].map(({ _rank, ...r }) => r);
  roles.sort((a, b) => b.score - a.score);
  return { roles, stats };
}

function isoOrNull(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
