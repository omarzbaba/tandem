/**
 * Writes a realistic sample board into public/data so the UI can be developed
 * and reviewed before (or independently of) a live harvest.
 *
 *   node tools/make-fixture.mjs
 *
 * Runs the real classify → geocode → score → pair pipeline over hand-written
 * postings, so what it produces is shaped exactly like a real run — this is a
 * fixture, not a mock.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeAll } from "../scout/normalize.mjs";
import { buildMetros, buildPairs } from "../scout/pair.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

const src = (name, category) => ({ name, url: `https://example.org/${category}`, category });

const P = (title, org, location, description, datePosted, id) => ({
  title,
  org,
  location,
  description,
  url: `https://example.org/jobs/${id}`,
  datePosted,
  department: "",
});

const HARVEST = [
  {
    source: src("SVS JobBoard", "society-board"),
    postings: [
      P(
        "Vascular Surgeon — Open and Endovascular",
        "Cleveland Clinic",
        "Cleveland, OH",
        "Our vascular surgery division seeks a fellowship-trained vascular surgeon for a mixed open and endovascular practice. Complex aortic work including EVAR and TEVAR, limb salvage and CLTI volume, hybrid OR available. Level I trauma centre. Call 1:6. Academic appointment commensurate with experience. Contact recruitment@example.org or (216) 555-0142.",
        daysAgo(4),
        "v1"
      ),
      P(
        "Chief of Vascular Surgery",
        "Henry Ford Health",
        "Detroit, MI",
        "Division chief opportunity leading a team of eight vascular surgeons. Open and endovascular case mix, dialysis access volume, hybrid operating room. Academic appointment at the associate or full professor level. Level I trauma centre.",
        daysAgo(11),
        "v2"
      ),
      P(
        "Vascular and Endovascular Surgeon",
        "Akron General",
        "Akron, OH",
        "Busy community vascular practice with strong PAD and limb salvage volume. Partnership track after two years. Favorable call.",
        daysAgo(20),
        "v3"
      ),
      P(
        "Consultant Vascular Surgeon",
        "Hamad Medical Corporation",
        "Doha, Qatar",
        "Consultant-level appointment in vascular surgery at a tertiary referral centre. Open and endovascular practice, complex aortic work, hybrid theatre. Tax-free package, housing and schooling allowance, annual leave and flights.",
        daysAgo(8),
        "v4"
      ),
      P(
        "Vascular Surgeon",
        "Cleveland Clinic Abu Dhabi",
        "Abu Dhabi, United Arab Emirates",
        "Join our vascular surgery service. Open and endovascular case mix with complex aortic work. Western-trained consultants; DOH Abu Dhabi licensure required.",
        daysAgo(2),
        "v5"
      ),
      P(
        "Vascular Surgeon — Solo Coverage",
        "Rural Health Partners",
        "Boise, ID",
        "Solo coverage vascular position. Every other weekend call. No partnership.",
        daysAgo(65),
        "v6"
      ),
    ],
  },
  {
    source: src("ACR Career Center", "society-board"),
    postings: [
      P(
        "Diagnostic Radiologist — General",
        "Cleveland Clinic",
        "Cleveland, OH",
        "General diagnostic radiology post with body imaging and cross-sectional emphasis. CT and MR. Night call covered by our overnight service. 12 weeks vacation. Home workstation provided for hybrid reading.",
        daysAgo(3),
        "r1"
      ),
      P(
        "Diagnostic Radiologist, Partnership Track",
        "Western Reserve Imaging Associates LLC",
        "Cleveland, OH",
        "Private group seeking a general diagnostic radiologist. Partnership in 2 years. Subspecialty fellowship-trained welcome. Body imaging and cross-sectional work. Call covered. Contact careers@example.org.",
        daysAgo(9),
        "r2"
      ),
      P(
        "Body Imaging Radiologist",
        "Akron General",
        "Akron, OH",
        "Body imaging radiologist for a growing cross-sectional service. CT and MR. Hybrid reading supported.",
        daysAgo(16),
        "r3"
      ),
      P(
        "Consultant Radiologist (Diagnostic)",
        "Hamad Medical Corporation",
        "Doha, Qatar",
        "Consultant diagnostic radiologist. General diagnostic radiology with body imaging and cross-sectional reporting. Tax-free salary, housing, schooling.",
        daysAgo(8),
        "r4"
      ),
      P(
        "Diagnostic Radiologist",
        "Sidra Medicine",
        "Doha, Qatar",
        "General diagnostic radiology appointment at a tertiary paediatric and women's hospital. QCHP licensure supported.",
        daysAgo(25),
        "r5"
      ),
      P(
        "Interventional Radiologist",
        "Henry Ford Health",
        "Detroit, MI",
        "Interventional radiology post covering the full IR service line.",
        daysAgo(14),
        "r6"
      ),
      P(
        "Teleradiologist — Remote",
        "National Reads Group",
        "Remote",
        "Fully remote general diagnostic teleradiology. Home workstation supplied. Flexible scheduling.",
        daysAgo(6),
        "r7"
      ),
      P(
        "Diagnostic Radiologist",
        "Michigan Medicine",
        "Ann Arbor, MI",
        "Academic general diagnostic radiology faculty appointment at a university school of medicine. Cross-sectional imaging, protected academic time, residency and fellowship teaching.",
        daysAgo(30),
        "r8"
      ),
    ],
  },
];

const { roles, stats } = normalizeAll(HARVEST, {
  today: TODAY,
  preferredCountries: ["US", "QA", "AE", "SA", "KW", "BH", "OM"],
});
for (const r of roles) r.isNew = (r.ageDays ?? 99) <= 7;

const radiusMiles = 45;
const pairs = buildPairs(roles, { radiusMiles });
const metros = buildMetros(roles, { radiusMiles });

const run = {
  ranAt: new Date().toISOString(),
  today: TODAY,
  radiusMiles,
  counts: {
    sourcesRegistered: HARVEST.length,
    sourcesAttempted: HARVEST.length,
    sourcesFailed: 0,
    rawPostings: stats.raw,
    irrelevant: stats.irrelevant,
    duplicates: stats.duplicates,
    unlocated: stats.unlocated,
    roles: roles.length,
    vascular: roles.filter((r) => r.specialty === "vascular").length,
    radiology: roles.filter((r) => r.specialty === "radiology").length,
    newThisRun: roles.filter((r) => r.isNew).length,
    carriedOver: 0,
    pairs: pairs.length,
    metros: metros.length,
    togetherMetros: metros.filter((m) => m.isTogether).length,
  },
  failedSources: [],
  emptySources: [],
  sweepOnlySources: [],
  isFixture: true,
};

const out = resolve(ROOT, "public/data");
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "roles.json"), JSON.stringify({ today: TODAY, roles }, null, 1));
writeFileSync(resolve(out, "metros.json"), JSON.stringify({ today: TODAY, radiusMiles, metros, pairs }, null, 1));
writeFileSync(resolve(out, "run.json"), JSON.stringify(run, null, 2));

console.log(`Fixture: ${roles.length} roles, ${pairs.length} pairs, ${run.counts.togetherMetros} together-metros`);
for (const m of metros.filter((x) => x.isTogether)) {
  console.log(`  ${String(m.score).padStart(3)}  ${m.label} — ${m.vascularCount}v/${m.radiologyCount}r, span ${m.spanMiles}mi`);
}
