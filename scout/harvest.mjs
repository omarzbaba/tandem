/**
 * Weekly harvest entrypoint. Run by .github/workflows/harvest.yml, and safe to
 * run locally with the same result.
 *
 *   node scout/harvest.mjs [--radius 45] [--out public/data] [--limit-sources N]
 *
 * Writes public/data/{roles,metros,run}.json, which Vite copies into the build
 * untouched. The run report is a first-class output: it records which sources
 * returned nothing and which failed, because "no vascular jobs in Ohio this
 * week" and "the Ohio source 403'd" look identical on a board and mean
 * opposite things.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { SOURCES } from "./sources.mjs";
import { harvestSource } from "./adapters/index.mjs";
import { normalizeAll } from "./normalize.mjs";
import { buildPairs, buildMetros, DEFAULT_RADIUS_MILES } from "./pair.mjs";
import { mapLimit } from "./http.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONCURRENCY = 6;

function parseArgs(argv) {
  const args = { radius: DEFAULT_RADIUS_MILES, out: "public/data", limitSources: Infinity };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--radius") args.radius = Number(argv[++i]) || DEFAULT_RADIUS_MILES;
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--limit-sources") args.limitSources = Number(argv[++i]) || Infinity;
  }
  return args;
}

/** Today in UTC. Passed through explicitly so scoring is testable. */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Carry forward roles that were on the board last week but whose source failed
 * this week, marked stale. Dropping them would make a transient 503 look like
 * a closed posting, and the couple would lose track of a live opportunity.
 */
function carryForward(previous, freshIds, failedSourceNames, today) {
  if (!previous?.roles?.length || !failedSourceNames.size) return [];
  return previous.roles
    .filter((r) => !freshIds.has(r.id) && failedSourceNames.has(r.source?.name))
    .map((r) => ({
      ...r,
      stale: true,
      staleSince: r.stale && r.staleSince ? r.staleSince : today,
      concerns: [...new Set([...(r.concerns ?? []), "carried over — its source was unreachable this run"])],
    }))
    // Two consecutive misses is enough; after that assume the posting is gone.
    .filter((r) => daysBetween(r.staleSince, today) <= 14);
}

function daysBetween(a, b) {
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.abs(Math.round((t2 - t1) / 86_400_000));
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const today = todayISO();
  const outDir = resolve(ROOT, args.out);

  const active = SOURCES.filter((s) => s.machineReadable?.endpoint && s.machineReadable.kind !== "none").slice(
    0,
    args.limitSources
  );
  const manualOnly = SOURCES.length - active.length;

  console.log(`Tandem harvest — ${today}`);
  console.log(`${SOURCES.length} sources registered, ${active.length} machine-readable, ${manualOnly} sweep-only\n`);

  const results = await mapLimit(active, CONCURRENCY, async (src) => {
    const res = await harvestSource(src, process.env);
    const n = res.postings.length;
    const flag = res.error ? `FAILED (${res.error})` : res.skipped ? `skipped (${res.skipped})` : `${n}`;
    console.log(`  ${String(n).padStart(4)}  ${src.name.slice(0, 58).padEnd(58)} ${res.error ? flag : ""}`);
    return { source: src, ...res };
  });

  const harvested = results.filter(Boolean);
  const failures = harvested.filter((r) => r.error);
  const failedSourceNames = new Set(failures.map((r) => r.source.name));

  const { roles: fresh, stats } = normalizeAll(harvested, {
    today,
    preferredCountries: ["US", "QA", "AE", "SA", "KW", "BH", "OM"],
  });

  const previous = readJsonIfExists(resolve(outDir, "roles.json"));
  const freshIds = new Set(fresh.map((r) => r.id));
  const carried = carryForward(previous, freshIds, failedSourceNames, today);
  const roles = [...fresh, ...carried].sort((a, b) => b.score - a.score);

  // New-since-last-run, so the board can lead with what actually changed.
  const previousIds = new Set((previous?.roles ?? []).map((r) => r.id));
  for (const r of roles) r.isNew = previousIds.size > 0 && !previousIds.has(r.id);

  const pairs = buildPairs(roles, { radiusMiles: args.radius });
  const metros = buildMetros(roles, { radiusMiles: args.radius });
  const together = metros.filter((m) => m.isTogether);

  const run = {
    ranAt: new Date().toISOString(),
    today,
    radiusMiles: args.radius,
    counts: {
      sourcesRegistered: SOURCES.length,
      sourcesAttempted: active.length,
      sourcesFailed: failures.length,
      rawPostings: stats.raw,
      irrelevant: stats.irrelevant,
      duplicates: stats.duplicates,
      unlocated: stats.unlocated,
      roles: roles.length,
      vascular: roles.filter((r) => r.specialty === "vascular").length,
      radiology: roles.filter((r) => r.specialty === "radiology").length,
      newThisRun: roles.filter((r) => r.isNew).length,
      carriedOver: carried.length,
      pairs: pairs.length,
      metros: metros.length,
      togetherMetros: together.length,
    },
    // Named, not counted: a coverage gap has to be actionable.
    failedSources: failures.map((f) => ({ name: f.source.name, url: f.source.url, error: f.error })),
    emptySources: harvested
      .filter((r) => !r.error && !r.skipped && r.postings.length === 0)
      .map((r) => r.source.name),
    sweepOnlySources: SOURCES.filter(
      (s) => !s.machineReadable?.endpoint || s.machineReadable.kind === "none"
    ).map((s) => ({ name: s.name, url: s.url, query: s.query ?? null })),
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "roles.json"), JSON.stringify({ today, roles }, null, 1));
  writeFileSync(resolve(outDir, "metros.json"), JSON.stringify({ today, radiusMiles: args.radius, metros, pairs }, null, 1));
  writeFileSync(resolve(outDir, "run.json"), JSON.stringify(run, null, 2));

  console.log(`\n${roles.length} roles (${run.counts.vascular} vascular / ${run.counts.radiology} radiology)`);
  console.log(`${together.length} metros where BOTH can work · ${pairs.length} commutable pairs`);
  console.log(`${run.counts.newThisRun} new · ${carried.length} carried over · ${failures.length} sources failed`);
  if (failures.length) {
    console.log("\nCoverage gaps this run:");
    for (const f of run.failedSources) console.log(`  - ${f.name}: ${f.error}`);
  }
}

main().catch((err) => {
  console.error("harvest failed:", err);
  process.exit(1);
});
