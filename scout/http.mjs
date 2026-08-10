/**
 * Shared fetch wrapper for the harvester.
 *
 * Runs unattended in CI against ~100 third-party endpoints, so every request is
 * bounded, retried on transient failure only, and never allowed to throw past
 * the caller — one board going down must not cost the whole weekly run.
 */

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const UA =
  "TandemJobScout/1.0 (+https://github.com/omarzbaba/tandem) weekly-physician-job-aggregator";

function backoffMs(attempt) {
  // 600ms, 1.8s — deterministic, so CI logs are reproducible.
  return 600 * 3 ** (attempt - 1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @returns {Promise<{ok: boolean, status: number, body: string|null, error: string|null, url: string}>}
 */
export async function request(url, opts = {}) {
  const { method = "GET", headers = {}, body = null, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  let lastError = null;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { "user-agent": UA, accept: "*/*", ...headers },
        body,
        signal: controller.signal,
        redirect: "follow",
      });
      lastStatus = res.status;
      if (res.ok) {
        return { ok: true, status: res.status, body: await res.text(), error: null, url };
      }
      if (!RETRY_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) {
        return { ok: false, status: res.status, body: null, error: `HTTP ${res.status}`, url };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : String(err?.message ?? err);
      if (attempt === MAX_ATTEMPTS) break;
    } finally {
      clearTimeout(timer);
    }
    await sleep(backoffMs(attempt));
  }

  return { ok: false, status: lastStatus, body: null, error: lastError, url };
}

/** JSON convenience wrapper — a parse failure is reported, never thrown. */
export async function getJson(url, opts = {}) {
  const res = await request(url, opts);
  if (!res.ok) return { ok: false, data: null, error: res.error, status: res.status };
  try {
    return { ok: true, data: JSON.parse(res.body), error: null, status: res.status };
  } catch {
    return { ok: false, data: null, error: "invalid JSON", status: res.status };
  }
}

/** Strip HTML to plain text for keyword classification and scoring. */
export function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Run tasks with bounded concurrency; failures resolve to null, never reject. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = null;
        console.warn(`  ! task ${i} threw: ${err?.message ?? err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
