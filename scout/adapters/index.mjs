/**
 * ATS adapters.
 *
 * Every adapter takes a registry source and returns raw postings in one shape:
 *   { title, org, location, description, url, datePosted, department }
 *
 * Adapters never throw. A source that is down, rate-limited, or has changed its
 * response shape returns `{ postings: [], error }`, and the harvester records
 * the gap in the run report instead of silently shipping a thinner board.
 */

import { getJson, request, htmlToText } from "../http.mjs";

/**
 * Registry endpoints are written by researchers, not by a form, so they arrive
 * in several shapes:
 *   "https://host/path"
 *   "POST https://host/path body {\"limit\":20}"
 *   "POST https://host/path  body: {...}"
 * Parsing that here keeps every adapter free of the same defensive string
 * handling — and a POST body recorded in the registry is genuinely useful
 * information, because it is how the researcher confirmed the feed works.
 */
export function parseEndpoint(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { method: "GET", url: "", body: null };

  const m = text.match(/^(GET|POST)\s+(\S+)\s*(?:body\s*:?\s*([\s\S]+))?$/i);
  if (m) {
    return {
      method: m[1].toUpperCase(),
      url: m[2],
      body: m[3] ? m[3].trim() : null,
    };
  }
  // A bare URL with a trailing body but no verb.
  const b = text.match(/^(\S+)\s+body\s*:?\s*([\s\S]+)$/i);
  if (b) return { method: "POST", url: b[1], body: b[2].trim() };

  return { method: "GET", url: text, body: null };
}

/** Pull the first array of job-like objects out of an unfamiliar JSON payload. */
function findJobArray(node, depth = 0) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    // Phenom (Emory, Novant, Vituity) wraps every job as {data:{...}} —
    // unwrap before testing, or the array looks like it holds no jobs at all.
    const unwrapped = node.map((x) => (x && typeof x === "object" && x.data && typeof x.data === "object" ? x.data : x));
    const looksLikeJobs = unwrapped.some(
      (x) => x && typeof x === "object" && (x.title || x.name || x.Title || x.jobTitle || x.PostingTitle)
    );
    if (looksLikeJobs) return unwrapped;
    // Oracle Cloud Recruiting wraps the real list one level down, as
    // items[0].requisitionList. Recursing into a non-job array is what finds it.
    for (const child of node) {
      const hit = findJobArray(child, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  // Named keys first, so a payload with both facets and jobs picks the jobs.
  const preferred = [
    "jobs", "jobList", "requisitionList", "postings", "items", "results",
    "data", "content", "hits", "docs", "positions", "openings", "refineSearch",
  ];
  for (const key of preferred) {
    if (key in node) {
      const hit = findJobArray(node[key], depth + 1);
      if (hit) return hit;
    }
  }
  for (const value of Object.values(node)) {
    const hit = findJobArray(value, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Search terms swept on every keyword-driven feed.
 *
 * The registry was assembled per-source by researchers, and several endpoints
 * arrived with "radiologist" hard-coded into their query. Honouring that
 * verbatim silently under-searched the surgical half of the board — 62 vascular
 * posts against 500 radiology ones — which for a two-body search is the failure
 * that matters most: it hands one partner a worse board than the other. Both
 * specialties are therefore always swept, whatever a single entry happens to say.
 */
const SPECIALTY_TERMS = ["radiologist", "vascular surgeon"];

/** Rewrite a recorded POST body once per specialty term. */
function bodiesForEachSpecialty(rawBody) {
  if (!rawBody) return [null];
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return [rawBody];
  }
  const field = ["keywords", "searchText", "q", "query", "keyword"].find((k) => k in parsed);
  if (!field) return [rawBody];
  return SPECIALTY_TERMS.map((term) => JSON.stringify({ ...parsed, [field]: term }));
}

const pickField = (obj, keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
};

const shape = (p) => ({
  title: p.title ?? "",
  org: p.org ?? "",
  location: p.location ?? "",
  description: p.description ?? "",
  url: p.url ?? "",
  datePosted: p.datePosted ?? null,
  department: p.department ?? "",
});

const ok = (postings) => ({ postings: postings.filter((p) => p.title && p.url), error: null });
const fail = (error) => ({ postings: [], error });

/** Greenhouse — https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true */
async function greenhouse(src) {
  const res = await getJson(parseEndpoint(src.machineReadable.endpoint).url);
  if (!res.ok) return fail(res.error);
  const jobs = res.data?.jobs;
  if (!Array.isArray(jobs)) return fail("unexpected payload: no jobs[]");
  return ok(
    jobs.map((j) =>
      shape({
        title: j.title,
        org: src.name,
        location: j.location?.name ?? "",
        description: htmlToText(j.content ?? ""),
        url: j.absolute_url,
        datePosted: j.updated_at ?? j.first_published ?? null,
        department: (j.departments ?? []).map((d) => d.name).join(", "),
      })
    )
  );
}

/** Lever — https://api.lever.co/v0/postings/{token}?mode=json */
async function lever(src) {
  const res = await getJson(parseEndpoint(src.machineReadable.endpoint).url);
  if (!res.ok) return fail(res.error);
  if (!Array.isArray(res.data)) return fail("unexpected payload: not an array");
  return ok(
    res.data.map((j) =>
      shape({
        title: j.text,
        org: src.name,
        location: j.categories?.location ?? "",
        description: htmlToText(j.descriptionPlain ?? j.description ?? ""),
        url: j.hostedUrl ?? j.applyUrl,
        datePosted: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        department: j.categories?.team ?? j.categories?.department ?? "",
      })
    )
  );
}

/** Ashby — https://api.ashbyhq.com/posting-api/job-board/{token} */
async function ashby(src) {
  const res = await getJson(parseEndpoint(src.machineReadable.endpoint).url);
  if (!res.ok) return fail(res.error);
  const jobs = res.data?.jobs;
  if (!Array.isArray(jobs)) return fail("unexpected payload: no jobs[]");
  return ok(
    jobs.map((j) =>
      shape({
        title: j.title,
        org: src.name,
        location: j.location ?? "",
        description: htmlToText(j.descriptionHtml ?? j.descriptionPlain ?? ""),
        url: j.jobUrl ?? j.applyUrl,
        datePosted: j.publishedAt ?? null,
        department: j.department ?? j.team ?? "",
      })
    )
  );
}

/** SmartRecruiters — postings list is a summary, so detail is fetched per hit. */
async function smartrecruiters(src) {
  const res = await getJson(parseEndpoint(src.machineReadable.endpoint).url);
  if (!res.ok) return fail(res.error);
  const content = res.data?.content;
  if (!Array.isArray(content)) return fail("unexpected payload: no content[]");
  return ok(
    content.map((j) =>
      shape({
        title: j.name,
        org: src.name,
        location: [j.location?.city, j.location?.region, j.location?.country]
          .filter(Boolean)
          .join(", "),
        // The summary endpoint carries no body; the classifier falls back to
        // the title, which is where the specialty signal lives anyway.
        description: j.jobAd?.sections?.jobDescription?.text
          ? htmlToText(j.jobAd.sections.jobDescription.text)
          : "",
        url: j.applyUrl ?? `https://jobs.smartrecruiters.com/${j.company?.identifier ?? ""}/${j.id}`,
        datePosted: j.releasedDate ?? null,
        department: j.department?.label ?? "",
      })
    )
  );
}

/**
 * Generic JSON board. Covers Oracle Cloud Recruiting and Phenom (both very
 * common in US health systems and the Gulf) plus any bespoke JSON endpoint,
 * by locating the job array structurally rather than hard-coding one shape.
 */
async function json(src) {
  const { method, url, body } = parseEndpoint(src.machineReadable.endpoint);
  if (!url) return fail("no endpoint");

  // A keyword-driven endpoint is swept once per specialty; anything else runs
  // a single time.
  const bodies = method === "POST" ? bodiesForEachSpecialty(body ?? "{}") : [null];
  const rows = [];
  let lastError = null;

  for (const b of bodies) {
    const res = await request(url, {
      method,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: method === "POST" ? (b ?? "{}") : null,
    });
    if (!res.ok) {
      lastError = res.error;
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(res.body);
    } catch {
      lastError = "invalid JSON";
      continue;
    }
    const found = findJobArray(payload);
    if (found) rows.push(...found);
    else lastError = "no job array found in payload";
  }

  if (!rows.length) return fail(lastError ?? "no rows returned");

  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  })();

  return ok(
    rows.map((j) => {
      // Oracle ORC nests the useful bits; Phenom and friends are flat.
      const loc =
        pickField(j, ["primaryLocation", "location", "locationsText", "full_location", "location_name", "city", "jobLocation", "PrimaryLocation"]) ||
        (Array.isArray(j.Locations) ? j.Locations.map((l) => l?.LocalizedName).filter(Boolean).join("; ") : "") ||
        [pickField(j, ["city"]), pickField(j, ["state", "region"]), pickField(j, ["country"])]
          .filter(Boolean)
          .join(", ");
      let href = pickField(j, ["applyUrl", "apply_url", "url", "jobUrl", "detailUrl", "canonicalUrl", "canonicalPositionUrl", "externalPath", "link"]);
      // UltiPro's search payload has no link per row — the detail page is
      // always the board URL plus the opportunity id.
      if (!href && j.Id && url.includes("ultipro.com")) {
        href = url.replace(/\/JobBoardView\/.*$/, "") + "/OpportunityDetail?opportunityId=" + j.Id;
      }
      return shape({
        title: pickField(j, ["title", "name", "Title", "jobTitle", "PostingTitle"]),
        org: pickField(j, ["companyName", "company", "organization"]) || src.name,
        location: loc,
        description: htmlToText(
          pickField(j, ["description", "jobDescription", "shortDescription", "summary", "externalDescriptionStr"])
        ),
        url: href.startsWith("http") ? href : origin + href,
        datePosted: pickField(j, ["postedDate", "posted_date", "postedOn", "PostedDate", "releasedDate", "createdDate", "create_date", "publishedDate"]) || null,
        department: pickField(j, ["department", "category", "jobFamily", "businessUnit"]),
      });
    })
  );
}

/**
 * Workday — POST to /wday/cxs/{tenant}/{site}/jobs, paged 20 at a time.
 * `searchText` narrows to physician roles so a 40,000-posting tenant does not
 * have to be walked end to end.
 */
async function workday(src) {
  const { url: endpoint } = parseEndpoint(src.machineReadable.endpoint);
  if (!endpoint) return fail("no endpoint");
  const terms = SPECIALTY_TERMS;
  const seen = new Map();
  let anyOk = false;
  let lastError = null;

  for (const term of terms) {
    for (let offset = 0; offset < 100; offset += 20) {
      const res = await request(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ limit: 20, offset, searchText: term.trim(), appliedFacets: {} }),
      });
      if (!res.ok) {
        lastError = res.error;
        break;
      }
      anyOk = true;
      let data;
      try {
        data = JSON.parse(res.body);
      } catch {
        lastError = "invalid JSON";
        break;
      }
      const postings = data?.jobPostings ?? [];
      for (const j of postings) {
        const path = j.externalPath ?? "";
        const base = endpoint.split("/wday/cxs/")[0];
        const site = endpoint.split("/").slice(-2, -1)[0];
        const url = path.startsWith("http") ? path : `${base}/${site}${path}`;
        if (!seen.has(url)) {
          seen.set(
            url,
            shape({
              title: j.title,
              org: src.name,
              location: j.locationsText ?? j.bulletFields?.[0] ?? "",
              description: "",
              url,
              datePosted: j.postedOn ?? null,
              department: "",
            })
          );
        }
      }
      if (postings.length < 20) break;
    }
  }
  if (!anyOk) return fail(lastError ?? "no successful page");
  return ok([...seen.values()]);
}

/** Jobvite — https://jobs.jobvite.com/api/jobs?companyId={id}&careerSiteId=1 */
async function jobvite(src) {
  const res = await getJson(parseEndpoint(src.machineReadable.endpoint).url);
  if (!res.ok) return fail(res.error);
  const jobs = res.data?.requisitions ?? res.data?.jobs ?? [];
  if (!Array.isArray(jobs)) return fail("unexpected payload");
  return ok(
    jobs.map((j) =>
      shape({
        title: j.title,
        org: src.name,
        location: j.location ?? [j.city, j.state].filter(Boolean).join(", "),
        description: htmlToText(j.jobDescription ?? ""),
        url: j.applyUrl ?? j.detailUrl,
        datePosted: j.postedDate ?? null,
        department: j.department ?? j.category ?? "",
      })
    )
  );
}

/**
 * SuccessFactors Recruiting career sites (careers.<host>/<site>/search/…).
 *
 * SF is everywhere in the Gulf and exposes no JSON or RSS — the documented
 * feed paths all return the HTML shell. The markup is however standardised
 * across every SF tenant (`jobTitle-link`, `section-field facility`,
 * `section-field location`), so parsing it is stable rather than site-specific
 * guesswork. Paginated with `startrow`, and swept once per specialty.
 */
async function successfactors(src) {
  const { url } = parseEndpoint(src.machineReadable.endpoint);
  if (!url) return fail("no endpoint");

  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    return fail("invalid endpoint URL");
  }

  const seen = new Map();
  let anyOk = false;
  let lastError = null;

  for (const term of SPECIALTY_TERMS) {
    for (let startrow = 0; startrow < 100; startrow += 25) {
      const page = `${url}${url.includes("?") ? "&" : "?"}q=${encodeURIComponent(term)}&startrow=${startrow}`;
      const res = await request(page);
      if (!res.ok) {
        lastError = res.error;
        break;
      }
      anyOk = true;

      // Split on the anchor that opens each hit, then parse each chunk. A
      // single regex spanning one whole row is brittle here: the distance
      // between two hits varies with how many section fields SF renders.
      const chunks = res.body.split(/<a[^>]*class="[^"]*jobTitle-link/i).slice(1);
      if (!chunks.length) break;

      for (const chunk of chunks) {
        const rawHref = chunk.match(/href="([^"]+)"/)?.[1];
        const title = htmlToText(chunk.match(/>([\s\S]{1,200}?)<\/a>/)?.[1] ?? "");
        if (!rawHref || !title) continue;

        const href = rawHref.startsWith("http") ? rawHref : origin + rawHref;
        if (seen.has(href)) continue;

        // SF renders labelled section fields ("Facility", "City", "Country")
        // after the anchor. Reading the labels is far more reliable than
        // pattern-matching prose, and the markup is identical across tenants.
        const context = htmlToText(chunk.slice(0, 4000));
        const field = (label) =>
          context.match(new RegExp(`\\b${label}\\s*\\n+\\s*([^\\n]{2,60})`, "i"))?.[1]?.trim() ?? "";

        const city = field("City");
        const country = field("Country");
        const location = [city, country].filter(Boolean).join(", ") || field("Location");
        const facility = field("Facility");

        seen.set(
          href,
          shape({
            title,
            org: facility || src.name,
            location,
            description: context.slice(0, 800),
            url: href,
          })
        );
      }
      if (chunks.length < 25) break;
    }
  }

  if (!anyOk) return fail(lastError ?? "no page fetched");
  return ok([...seen.values()]);
}

/** RSS / Atom — covers iCIMS, Taleo, and most society job boards. */
async function rss(src) {
  const res = await request(parseEndpoint(src.machineReadable.endpoint).url);
  if (!res.ok) return fail(res.error);
  const xml = res.body ?? "";
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];

  // A sitemap of job pages (vRad) has <url><loc> entries instead of items.
  // The slug is the only title available; the pages themselves are JS-shells.
  if (!items.length && /<urlset\b/i.test(xml)) {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1].trim())
      .filter((u) => /job/i.test(u));
    if (!locs.length) return fail("sitemap contained no job URLs");
    return ok(
      locs.map((u) => {
        const slug = u.replace(/\/$/, "").split("/").pop() ?? "";
        const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return shape({
          title,
          org: src.name,
          location: /remote/i.test(slug) ? "Remote" : "",
          description: "",
          url: u,
        });
      })
    );
  }
  if (!items.length) return fail("feed contained no items");

  const pick = (chunk, tag) => {
    const m = chunk.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    if (!m) return "";
    return m[1]
      .replace(/^\s*<!\[CDATA\[/, "")
      .replace(/\]\]>\s*$/, "")
      .trim();
  };

  return ok(
    items.map((chunk) => {
      const linkTag = pick(chunk, "link");
      const hrefAttr = chunk.match(/<link[^>]*href="([^"]+)"/i)?.[1];
      const description = htmlToText(pick(chunk, "description") || pick(chunk, "summary") || pick(chunk, "content"));
      return shape({
        title: htmlToText(pick(chunk, "title")),
        org: src.name,
        // Feeds rarely have a location field; the title usually carries it and
        // the harvester re-parses it out of title + description downstream.
        location: pick(chunk, "location") || pick(chunk, "job:location") || "",
        description,
        url: linkTag || hrefAttr || "",
        datePosted: pick(chunk, "pubDate") || pick(chunk, "published") || pick(chunk, "updated") || null,
        department: pick(chunk, "category"),
      });
    })
  );
}

/** Adzuna — aggregator covering boards with no direct feed. Requires free creds. */
async function adzuna(src, env) {
  const id = env?.ADZUNA_APP_ID;
  const key = env?.ADZUNA_APP_KEY;
  if (!id || !key) return fail("ADZUNA_APP_ID / ADZUNA_APP_KEY not set — source skipped");

  const country = src.query?.includes("gb") ? "gb" : "us";
  const terms = ["vascular surgeon", "diagnostic radiologist"];
  const out = [];
  for (const what of terms) {
    for (let page = 1; page <= 3; page++) {
      const url =
        `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}` +
        `?app_id=${encodeURIComponent(id)}&app_key=${encodeURIComponent(key)}` +
        `&results_per_page=50&what_phrase=${encodeURIComponent(what)}&content-type=application/json`;
      const res = await getJson(url);
      if (!res.ok) return out.length ? ok(out) : fail(res.error);
      const results = res.data?.results ?? [];
      for (const j of results) {
        out.push(
          shape({
            title: j.title,
            org: j.company?.display_name ?? "",
            location: j.location?.display_name ?? "",
            description: htmlToText(j.description ?? ""),
            url: j.redirect_url,
            datePosted: j.created ?? null,
            department: j.category?.label ?? "",
          })
        );
      }
      if (results.length < 50) break;
    }
  }
  return ok(out);
}

const ADAPTERS = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  workday,
  successfactors,
  jobvite,
  rss,
  "icims-rss": rss,
  "taleo-rss": rss,
  json,
  adzuna,
};

/**
 * Run the adapter a source declares. Sources without a confirmed endpoint are
 * reported as `skipped` so the run report can say what was NOT covered — a
 * board silently contributing zero rows is indistinguishable from a board with
 * no openings, and those are very different facts.
 */
export async function harvestSource(src, env) {
  const kind = src.machineReadable?.kind;
  if (!kind || kind === "none" || !src.machineReadable?.endpoint) {
    return { postings: [], error: null, skipped: "no machine-readable endpoint" };
  }
  const adapter = ADAPTERS[kind];
  if (!adapter) return { postings: [], error: `no adapter for "${kind}"`, skipped: null };
  try {
    const res = await adapter(src, env);
    return { ...res, skipped: null };
  } catch (err) {
    return { postings: [], error: String(err?.message ?? err), skipped: null };
  }
}

export const ADAPTER_KINDS = Object.keys(ADAPTERS);
