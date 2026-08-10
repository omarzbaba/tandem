/**
 * Builds geo/gazetteer.json from the GeoNames cities1000 dump.
 *
 * Run once (or whenever GeoNames publishes a new dump) — the output is
 * committed so the weekly harvester geocodes offline, with no API key, no rate
 * limit, and byte-identical results between local runs and CI.
 *
 *   node tools/build-gazetteer.mjs /path/to/cities1000.txt /path/to/admin1CodesASCII.txt
 *
 * Source: https://download.geonames.org/export/dump/ (CC BY 4.0 — see NOTICE).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Countries the tool searches: the US plus the six GCC states. */
const COUNTRIES = new Set(["US", "QA", "AE", "SA", "KW", "BH", "OM"]);

/** GeoNames cities1000 column offsets. */
const COL = {
  name: 1,
  asciiName: 2,
  altNames: 3,
  lat: 4,
  lon: 5,
  country: 8,
  admin1: 10,
  population: 14,
};

function loadAdmin1(path) {
  const byCode = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const [code, name] = line.split("\t");
    if (code && name) byCode.set(code, name);
  }
  return byCode;
}

/**
 * US locations are written "City, ST" everywhere in job postings, so the US
 * keeps its postal abbreviation while Gulf entries get the full emirate /
 * governorate name resolved from admin1CodesASCII.
 */
function regionLabel(country, admin1Code, admin1Names) {
  if (country === "US") return admin1Code;
  return admin1Names.get(`${country}.${admin1Code}`) ?? "";
}

function build(citiesPath, admin1Path) {
  const admin1Names = loadAdmin1(admin1Path);
  const places = [];

  for (const line of readFileSync(citiesPath, "utf8").split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    const country = f[COL.country];
    if (!COUNTRIES.has(country)) continue;

    const population = Number(f[COL.population]) || 0;
    // Gulf gazetteers are thin at the 5k threshold, so keep every Gulf place
    // but keep US places down to 1,000 people: small towns host large hospitals
    // (Danville PA, pop ~4,600, is Geisinger's flagship campus), and omitting
    // them is what makes a resolver guess wrong.
    if (country === "US" && population < 1000) continue;

    const name = f[COL.asciiName] || f[COL.name];
    if (!name) continue;

    // Alternate names carry the transliteration variants that matter in the
    // Gulf (Doha/Ad Dawhah, Makkah/Mecca, Al Khubar/Khobar).
    const aliases =
      country === "US"
        ? []
        : (f[COL.altNames] || "")
            .split(",")
            .map((a) => a.trim())
            .filter((a) => a && /^[\x20-\x7E]+$/.test(a) && a.toLowerCase() !== name.toLowerCase())
            .slice(0, 6);

    places.push({
      n: name,
      r: regionLabel(country, f[COL.admin1], admin1Names),
      c: country,
      lat: Math.round(Number(f[COL.lat]) * 1e4) / 1e4,
      lon: Math.round(Number(f[COL.lon]) * 1e4) / 1e4,
      p: population,
      ...(aliases.length ? { a: aliases } : {}),
    });
  }

  // Descending population: the resolver takes the first hit on an ambiguous
  // name, and "Springfield" should mean the biggest Springfield.
  places.sort((a, b) => b.p - a.p);
  return places;
}

/**
 * Country- and state-level centroids, used as the fallback when a posting says
 * only "Saudi Arabia" or "Texas". Derived from the gazetteer itself so the two
 * can never drift apart.
 */
function buildCentroids(places) {
  const acc = new Map();
  for (const p of places) {
    for (const key of [p.c, p.r ? `${p.c}:${p.r}` : null]) {
      if (!key) continue;
      const cur = acc.get(key) ?? { lat: 0, lon: 0, w: 0 };
      cur.lat += p.lat * p.p;
      cur.lon += p.lon * p.p;
      cur.w += p.p;
      acc.set(key, cur);
    }
  }
  const out = {};
  for (const [key, v] of acc) {
    if (!v.w) continue;
    out[key] = {
      lat: Math.round((v.lat / v.w) * 1e4) / 1e4,
      lon: Math.round((v.lon / v.w) * 1e4) / 1e4,
    };
  }
  return out;
}

const [, , citiesPath, admin1Path] = process.argv;
if (!citiesPath || !admin1Path) {
  console.error("usage: node tools/build-gazetteer.mjs <cities1000.txt> <admin1CodesASCII.txt>");
  process.exit(1);
}

const places = build(citiesPath, admin1Path);
const centroids = buildCentroids(places);

mkdirSync(resolve(ROOT, "geo"), { recursive: true });
writeFileSync(
  resolve(ROOT, "geo/gazetteer.json"),
  JSON.stringify({ places, centroids }),
  "utf8"
);

const byCountry = places.reduce((m, p) => ((m[p.c] = (m[p.c] ?? 0) + 1), m), {});
console.log(`gazetteer.json — ${places.length} places`, byCountry);
console.log(`${Object.keys(centroids).length} centroids`);
