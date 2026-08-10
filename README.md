# Tandem

A weekly job board for a two-physician couple. It sweeps vascular surgery and
diagnostic radiology posts across the United States and the Gulf, then leads
with the thing a couple actually needs and no ordinary job board will tell them:
**the places where both of them can work.**

Two attendings looking to relocate together do not have a job-search problem
twice over. They have a different problem — the intersection — and the answer is
usually a handful of metros, not a list of postings. That intersection is the
front page here.

---

## What it does

- **Together tab.** Commutable areas containing at least one opening in *each*
  specialty, scored on how good both sides are, how far apart they sit, and
  whether one employer is hiring for both. A slider redraws the map live from 15
  to 120 miles.
- **Half an opportunity.** Areas where only one of them has a post. Not mixed in
  with the real matches — these are phone calls, not places to move to.
- **Two specialty tabs**, filterable by country, setting, work model, fit score
  and free text.
- **Shared pins, statuses and notes.** Either of them pins a role and the other
  sees it, on any device.
- **A ready-to-send enquiry** for every post, pre-written around the two-body
  situation, plus any recruiter email or phone found in the posting.
- **Coverage tab.** Every source that failed, returned nothing, or needs a human.
  A quiet board and a broken board look identical unless you say which it is.

## How it stays current

Two independent layers, so the board is never at the mercy of one of them.

**Automated (GitHub Actions, every Monday 06:00 UTC).** `scout/harvest.mjs`
walks the registry, pulling from confirmed machine-readable endpoints —
Greenhouse, Lever, Ashby, SmartRecruiters, Workday CXS, Jobvite, and iCIMS /
Taleo / society RSS. It classifies, geocodes, scores, deduplicates, rebuilds the
co-location clusters, commits the result, and redeploys. No API keys required,
no browser, no model call, and nobody's laptop needs to be open.

**Deep sweep (optional, on demand).** Boards that bot-block a plain fetch are
listed in the Coverage tab with a suggested search string, for a human or an
agent to work through periodically.

## The co-location engine

Everything interesting lives in `scout/pair.mjs`, and its central concern is not
overstating what it knows.

- Distance is great-circle, presented with a 1.25× road-circuity factor and a
  35 mph average as an **estimated** drive time. It is never called a routed
  drive time, because it is not one.
- Every location carries the precision it resolved at — `city`, `region`,
  `country`, `remote`, `none`. Two postings that both say only "Texas" are not
  allowed to look like a 0-mile commute; that pair is labelled *approximate* and
  scored down.
- Qatar, Bahrain and Kuwait are small enough that "somewhere in this country"
  genuinely does mean one labour market. Those get their own confidence level
  rather than being lumped in with either extreme.
- Area scores use a **harmonic** mean of the two sides. A 95-scoring vascular job
  next to a 25-scoring radiology job must not outrank two solid 60s — an
  arithmetic mean would rank it first, which is exactly the false positive a
  two-body search cannot afford.
- Depth counts. A second opening on each side is a fallback if one offer
  evaporates, and real leverage in a negotiation.

Geocoding is fully offline, from a GeoNames-derived gazetteer of ~7,900 US and
Gulf places committed to `geo/`. No geocoding API means no key, no rate limit,
and byte-identical results in CI and on a laptop. Arabic transliteration is
handled by canonicalising both the index and the query, so "Al Khobar", "Khobar"
and "Al-Khobar" all land on the same city.

## Setup

```bash
npm install
npm run dev
```

### Deploying

1. Push to GitHub, then **Settings → Pages → Source: GitHub Actions**.
2. Run the **Weekly harvest** workflow once by hand to populate the board.

`VITE_BASE` is set automatically from the repository name. For a custom domain,
set it to `/`.

### Sharing pins between two people

Without this, pins live in each browser separately and the board still works.

1. Create a free Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Run `select gen_random_uuid();` and keep the result — it is what protects the
   board.
4. Put the project URL, the **anon** key, and that UUID into
   `public/config.json`.

Read the security note at the top of `supabase/schema.sql` first. There is no
login: the board id is the secret, the anon key is public by design, and the
policies allow no deletes and no enumeration. That is a deliberate trade for a
two-person board, and it is the wrong trade for anything larger.

### Making it theirs

`public/config.json` also carries the board title, tagline, and the two partner
labels. Names are blank by default so nothing personal is committed to a public
repository — fill them in if you would rather the board greeted them by name.

## Layout

```
scout/          the weekly harvester
  registry.json   the source registry — data, not code
  sources.mjs     loads and validates it
  adapters/       one adapter per ATS
  classify.mjs    is this an attending post, and in which specialty?
  geocode.mjs     location string → coordinates, with honest precision
  geo-math.mjs    pure distance maths, shared with the browser
  score.mjs       explainable 0–100 fit, per specialty
  pair.mjs        the co-location engine
  normalize.mjs   dedup and canonical-source selection
  harvest.mjs     entrypoint
geo/            committed gazetteer
src/            the board (React + Vite)
public/data/    what the harvester writes; what the board reads
supabase/       schema for shared pins
```

## Testing

```bash
npm test          # engine + UI
npm run typecheck
```

The engine tests are the ones that matter. They cover the failure modes that
would quietly corrupt the board rather than break it: St. Louis MO resolving to
Michigan, a bare "Texas" being treated as a city, a radiology *scheduler* posting
classified as a radiologist, and two country-level centroids being sold as a
commute.

## Credits

Place data from [GeoNames](https://www.geonames.org/), CC BY 4.0.
Type is Instrument Serif and Inter, both SIL Open Font License, self-hosted.
