# Tandem

> Created for Dr. Rashad W. Wehbe (vascular surgery) and
> Dr. Samia K. Al Sayyid Wehbe (diagnostic radiology).
> © 2026 Omar Z. Baba, MD. Code under the MIT License.

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
- **Remote-unlocked areas.** Diagnostic radiology reads from anywhere; vascular
  surgery does not. One remote post on her side makes *every* surgical opening
  workable, which is a far larger opportunity space than physical co-location
  will ever produce. These get their own band — never counted as both-on-site,
  because "you can both work here" and "he works here, she reads from home" are
  different claims.
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
Greenhouse, Lever, Ashby, SmartRecruiters, Workday CXS, Oracle Cloud Recruiting,
SuccessFactors, Jobvite, and iCIMS / Taleo / society RSS. Oracle ORC and
SuccessFactors matter disproportionately: between them they run most of the Gulf
health systems. It classifies, geocodes, scores, deduplicates, rebuilds the
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

Geocoding is fully offline, from a GeoNames-derived gazetteer of ~17,300 US and
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

Deployed on Vercel, which builds from the repository. The weekly harvest commits
new data and Vercel redeploys on the push, so the board refreshes with no manual
step.

Run the **Weekly harvest** workflow once by hand to populate a fresh deployment.

### Shared pins

Pins, statuses and notes are shared through `/api/marks`, a serverless function
that holds the database credential in its own environment. **The browser ships
with no key of any kind.** The store is a dedicated `tandem_marks` table whose
grants exclude `anon` and `authenticated` entirely, so the endpoint cannot reach
any other table even in principle.

Three environment variables on the host:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL (server-side only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Store credential (server-side only) |
| `BOARD_ID` | The shared access code, held server-side only |

**Sign-in.** First visit shows a gate: one shared access code, checked by
`/api/marks` against the server-held `BOARD_ID` (constant-time compare, 403 on
mismatch) and then remembered by that browser — each device asks exactly once.
The code appears nowhere in the shipped JavaScript. There are no accounts: the
code is the boundary, and the "who are you" choice on the gate only attributes
pins to each partner. Sound for a two-person board of public job postings; the
wrong trade for anything sensitive.

Without a code (local dev), marks fall back to per-browser `localStorage`, so
the app runs with no backend at all.

### Making it theirs

`public/config.json` also carries the board title, tagline, and the two partner
labels. Partner names and the dedication live in `public/config.json` and the footer.

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
api/            the shared-pins endpoint (credential stays server-side)
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
