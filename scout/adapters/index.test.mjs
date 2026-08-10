import { afterEach, describe, expect, test, vi } from "vitest";
import { harvestSource } from "./index.mjs";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

/** Stub fetch with a single canned response. */
function respond(body, { ok = true, status = 200 } = {}) {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));
}

const src = (kind, endpoint, over = {}) => ({
  name: "Example Health",
  url: "https://example.org",
  category: "health-system",
  machineReadable: { kind, endpoint, confirmed: true },
  ...over,
});

describe("harvestSource — dispatch", () => {
  test("a source with no endpoint is reported as skipped, not as empty", () => {
    // The distinction matters: skipped means "not covered", empty means
    // "covered, nothing there".
    return harvestSource(src("none", ""), {}).then((res) => {
      expect(res.skipped).toBeTruthy();
      expect(res.error).toBeNull();
      expect(res.postings).toEqual([]);
    });
  });

  test("an unknown adapter kind is an error, not a silent zero", async () => {
    const res = await harvestSource(src("nonsense", "https://example.org/api"), {});
    expect(res.error).toMatch(/no adapter/);
  });

  test("an HTTP failure surfaces as an error", async () => {
    respond("", { ok: false, status: 503 });
    const res = await harvestSource(src("greenhouse", "https://example.org/api"), {});
    expect(res.error).toBeTruthy();
    expect(res.postings).toEqual([]);
  });

  test("an unexpected payload shape is reported rather than throwing", async () => {
    respond({ notJobs: [] });
    const res = await harvestSource(src("greenhouse", "https://example.org/api"), {});
    expect(res.error).toMatch(/unexpected payload/);
  });
});

describe("greenhouse", () => {
  test("maps jobs and strips HTML from the body", async () => {
    respond({
      jobs: [
        {
          title: "Vascular Surgeon",
          location: { name: "Cleveland, OH" },
          content: "<p>Open &amp; endovascular practice.</p><p>Hybrid OR.</p>",
          absolute_url: "https://boards.greenhouse.io/example/jobs/1",
          updated_at: "2026-08-01T00:00:00Z",
          departments: [{ name: "Surgery" }],
        },
      ],
    });
    const res = await harvestSource(src("greenhouse", "https://example.org/api"), {});
    expect(res.postings).toHaveLength(1);
    expect(res.postings[0]).toMatchObject({
      title: "Vascular Surgeon",
      location: "Cleveland, OH",
      department: "Surgery",
      url: "https://boards.greenhouse.io/example/jobs/1",
    });
    expect(res.postings[0].description).toContain("Open & endovascular practice.");
    expect(res.postings[0].description).not.toContain("<p>");
  });
});

describe("lever", () => {
  test("maps a top-level array", async () => {
    respond([
      {
        text: "Diagnostic Radiologist",
        categories: { location: "Doha, Qatar", team: "Imaging" },
        descriptionPlain: "General diagnostic radiology.",
        hostedUrl: "https://jobs.lever.co/example/1",
        createdAt: 1_754_000_000_000,
      },
    ]);
    const res = await harvestSource(src("lever", "https://example.org/api"), {});
    expect(res.postings[0]).toMatchObject({
      title: "Diagnostic Radiologist",
      location: "Doha, Qatar",
      department: "Imaging",
    });
    expect(res.postings[0].datePosted).toMatch(/^\d{4}-/);
  });
});

describe("rss", () => {
  const FEED = `<?xml version="1.0"?><rss><channel>
    <item>
      <title><![CDATA[Vascular Surgeon — Akron, OH]]></title>
      <link>https://example.org/jobs/9</link>
      <description><![CDATA[<p>Busy vascular practice.</p>]]></description>
      <pubDate>Mon, 04 Aug 2026 09:00:00 GMT</pubDate>
      <category>Surgery</category>
    </item>
  </channel></rss>`;

  test("parses items, unwraps CDATA and strips markup", async () => {
    respond(FEED);
    const res = await harvestSource(src("rss", "https://example.org/feed"), {});
    expect(res.postings).toHaveLength(1);
    expect(res.postings[0].title).toBe("Vascular Surgeon — Akron, OH");
    expect(res.postings[0].url).toBe("https://example.org/jobs/9");
    expect(res.postings[0].description).toBe("Busy vascular practice.");
  });

  test("an empty feed is an error, because a silent zero looks like no vacancies", async () => {
    respond("<?xml version='1.0'?><rss><channel></channel></rss>");
    const res = await harvestSource(src("rss", "https://example.org/feed"), {});
    expect(res.error).toMatch(/no items/);
  });

  test("iCIMS and Taleo reuse the RSS adapter", async () => {
    respond(FEED);
    const res = await harvestSource(src("icims-rss", "https://example.org/feed"), {});
    expect(res.postings).toHaveLength(1);
  });
});

describe("workday", () => {
  test("builds absolute URLs from externalPath and stops on a short page", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          jobPostings: [
            { title: "Diagnostic Radiologist", locationsText: "Detroit, MI", externalPath: "/job/Detroit/Rad_R-1", postedOn: "Posted 3 Days Ago" },
          ],
        }),
    }));
    const res = await harvestSource(
      src("workday", "https://example.wd1.myworkdayjobs.com/wday/cxs/example/careers/jobs", {
        query: "radiologist",
      }),
      {}
    );
    expect(res.postings).toHaveLength(1);
    expect(res.postings[0].url).toBe(
      "https://example.wd1.myworkdayjobs.com/careers/job/Detroit/Rad_R-1"
    );
  });
});

describe("adzuna", () => {
  test("is skipped with a clear reason when credentials are absent", async () => {
    const res = await harvestSource(src("adzuna", "https://api.adzuna.com"), {});
    expect(res.error).toMatch(/ADZUNA_APP_ID/);
  });
});
