/**
 * Finds a machine-readable jobs endpoint for a careers page.
 *
 *   node tools/probe-ats.mjs <careers-url> [more urls...]
 *
 * Fetches the page, fingerprints which applicant-tracking system it runs,
 * constructs the matching API call and — the part that matters — actually
 * calls it and reports how many real postings came back. A registry entry is
 * only worth adding once it has returned jobs, so this refuses to guess.
 *
 * Reusable: adding an employer later is a matter of running this, not of
 * rediscovering every ATS URL shape by hand.
 */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TIMEOUT = 25_000;

async function get(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      ...opts,
      headers: { "user-agent": UA, accept: "*/*", ...(opts.headers ?? {}) },
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, status: 0, body: "", error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

function countJobs(text) {
  try {
    const d = JSON.parse(text);
    const find = (node, depth = 0) => {
      if (!node || depth > 6) return 0;
      if (Array.isArray(node)) {
        const unwrapped = node.map((x) => (x && x.data && typeof x.data === "object" ? x.data : x));
        if (unwrapped.some((x) => x && typeof x === "object" && (x.title || x.name || x.Title || x.PostingTitle))) {
          return unwrapped.length;
        }
        return node.reduce((m, c) => Math.max(m, find(c, depth + 1)), 0);
      }
      if (typeof node !== "object") return 0;
      return Object.values(node).reduce((m, v) => Math.max(m, find(v, depth + 1)), 0);
    };
    return find(d);
  } catch {
    return 0;
  }
}

/** Each detector returns a candidate {kind, endpoint, method, body} or null. */
const DETECTORS = [
  function workday(html) {
    const m = html.match(/https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/([A-Za-z0-9_-]+)/i);
    if (!m) return null;
    const [, tenant, wd, site] = m;
    return {
      kind: "workday",
      method: "POST",
      endpoint: `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
      body: JSON.stringify({ limit: 20, offset: 0, searchText: "radiologist", appliedFacets: {} }),
    };
  },
  function oracle(html) {
    const host = html.match(/https?:\/\/([a-z0-9-]+\.fa\.[a-z0-9]+\.oraclecloud\.com)/i);
    if (!host) return null;
    const site = html.match(/CX_\d+/)?.[0] ?? "CX_1";
    return {
      kind: "json",
      method: "GET",
      endpoint: `https://${host[1]}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${site},limit=200`,
    };
  },
  function greenhouse(html) {
    const t = html.match(/(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i);
    if (!t) return null;
    return {
      kind: "greenhouse",
      method: "GET",
      endpoint: `https://boards-api.greenhouse.io/v1/boards/${t[1]}/jobs?content=true`,
    };
  },
  function lever(html) {
    const t = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
    if (!t) return null;
    return { kind: "lever", method: "GET", endpoint: `https://api.lever.co/v0/postings/${t[1]}?mode=json` };
  },
  function phenom(html, url) {
    if (!/phenom|widget\/jobs|\/api\/jobs/i.test(html)) return null;
    const origin = new URL(url).origin;
    return {
      kind: "json",
      method: "GET",
      endpoint: `${origin}/api/jobs?keywords=radiologist&limit=50&page=1&sortBy=relevance`,
    };
  },
  function successfactors(html) {
    const m = html.match(/https?:\/\/(careers\.[a-z0-9.-]+)\/([A-Za-z0-9_-]+)\/(?:search|job)\//i);
    if (!m) return null;
    return { kind: "successfactors", method: "GET", endpoint: `https://${m[1]}/${m[2]}/search/` };
  },
  function icims(html) {
    const m = html.match(/https?:\/\/([a-z0-9-]+)\.icims\.com/i);
    if (!m) return null;
    return { kind: "icims-rss", method: "GET", endpoint: `https://${m[1]}.icims.com/jobs/search/rss?searchKeyword=radiologist` };
  },
];

async function probe(url) {
  const page = await get(url);
  if (!page.ok) return { url, result: `page ${page.status || page.error}` };

  for (const detect of DETECTORS) {
    const cand = detect(page.body, url);
    if (!cand) continue;
    const res = await get(cand.endpoint, {
      method: cand.method,
      headers: cand.method === "POST" ? { "content-type": "application/json" } : {},
      body: cand.body,
    });
    if (!res.ok) {
      // Keep trying other detectors; a page can mention several systems.
      continue;
    }
    const n = cand.kind === "successfactors" ? (res.body.match(/jobTitle-link/g) ?? []).length : countJobs(res.body);
    if (n > 0) {
      return {
        url,
        result: `OK ${n} jobs`,
        kind: cand.kind,
        endpoint: cand.method === "POST" ? `POST ${cand.endpoint} body ${cand.body}` : cand.endpoint,
      };
    }
  }
  return { url, result: "no working endpoint found" };
}

const urls = process.argv.slice(2);
if (!urls.length) {
  console.error("usage: node tools/probe-ats.mjs <careers-url> [...]");
  process.exit(1);
}

const out = [];
for (const u of urls) {
  const r = await probe(u);
  out.push(r);
  console.log(`${r.result.padEnd(28)} ${new URL(u).hostname}`);
  if (r.endpoint) console.log(`    ${r.kind}: ${r.endpoint.slice(0, 150)}`);
}
console.log("\n--- confirmed ---");
console.log(JSON.stringify(out.filter((r) => r.endpoint), null, 1));
