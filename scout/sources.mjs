/**
 * The source registry — what this tool actually scours.
 *
 * The data lives in registry.json rather than in code, so refreshing the
 * registry is a data change (reviewable as a diff, regenerable by the research
 * workflow) and never a code change. This module's job is to load it and refuse
 * malformed entries loudly, because a silently-dropped source becomes a silent
 * coverage gap two weeks later.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const ADAPTER_KINDS = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
  "successfactors",
  "jobvite",
  "rss",
  "icims-rss",
  "taleo-rss",
  "json",
  "adzuna",
  "none",
]);

const REQUIRED = ["name", "url", "category", "specialty", "geos"];

function validate(entry, index) {
  const problems = [];
  for (const field of REQUIRED) {
    if (!entry[field]) problems.push(`missing ${field}`);
  }
  if (entry.geos && !Array.isArray(entry.geos)) problems.push("geos must be an array");

  const mr = entry.machineReadable;
  if (mr) {
    if (!ADAPTER_KINDS.has(mr.kind)) problems.push(`unknown machineReadable.kind "${mr.kind}"`);
    if (mr.kind !== "none" && !mr.endpoint) problems.push(`kind "${mr.kind}" with no endpoint`);
  }

  if (problems.length) {
    console.warn(`registry entry ${index} (${entry.name ?? "unnamed"}): ${problems.join("; ")} — skipped`);
    return false;
  }
  return true;
}

function load() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolve(HERE, "registry.json"), "utf8"));
  } catch (err) {
    console.error(`Could not read scout/registry.json: ${err.message}`);
    return [];
  }

  const entries = Array.isArray(raw) ? raw : (raw.sources ?? []);
  return entries
    .filter(validate)
    .map((e) => ({
      ...e,
      requiresEnv: e.requiresEnv ?? [],
      machineReadable: e.machineReadable ?? { kind: "none", endpoint: "", confirmed: false },
    }))
    // Confirmed feeds first: if a run is ever cut short, the highest-yield
    // sources are the ones already done.
    .sort((a, b) => Number(b.machineReadable.confirmed) - Number(a.machineReadable.confirmed));
}

export const SOURCES = load();

export const MACHINE_READABLE_SOURCES = SOURCES.filter(
  (s) => s.machineReadable.kind !== "none" && s.machineReadable.endpoint
);

export const SWEEP_ONLY_SOURCES = SOURCES.filter(
  (s) => s.machineReadable.kind === "none" || !s.machineReadable.endpoint
);
