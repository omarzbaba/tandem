import { describe, expect, test } from "vitest";
import { buildDigest } from "./digest.mjs";

const role = (over = {}) => ({
  id: "acme::vascular surgeon::cleveland",
  title: "Vascular Surgeon",
  org: "Acme Vascular Group",
  specialty: "vascular",
  score: 72,
  setting: "private",
  workModel: "onsite",
  url: "https://example.org/jobs/1",
  locationText: "Cleveland, OH",
  geo: { city: "Cleveland", region: "OH", country: "US" },
  isNew: true,
  ...over,
});

const run = { today: "2026-08-10", ranAt: "2026-08-10T06:10:00Z", counts: { sourcesFailed: 0 } };
const OPTS = { siteUrl: "https://tandem-rs.vercel.app", today: "2026-08-10" };

describe("buildDigest", () => {
  test("only new posts make the digest, strongest first", () => {
    const { json } = buildDigest(
      [role({ id: "a", score: 60 }), role({ id: "b", score: 90 }), role({ id: "old", isNew: false })],
      [],
      run,
      OPTS
    );
    expect(json.newVascular.map((r) => r.id)).toEqual(["b", "a"]);
    expect(json.counts.newThisRun).toBe(2);
    expect(json.counts.totalRoles).toBe(3);
  });

  test("every entry carries both links: the posting and the board deep link", () => {
    const { json } = buildDigest([role()], [], run, OPTS);
    const e = json.newVascular[0];
    expect(e.postingUrl).toBe("https://example.org/jobs/1");
    expect(e.boardUrl).toBe(
      "https://tandem-rs.vercel.app/#role=" + encodeURIComponent("acme::vascular surgeon::cleveland")
    );
  });

  test("the email HTML names each post and links to the board", () => {
    const { html } = buildDigest([role()], [], run, OPTS);
    expect(html).toContain("Vascular Surgeon");
    expect(html).toContain("#role=");
    expect(html).toContain("Open the board");
  });

  test("the email never contains the access code and escapes markup", () => {
    const { html } = buildDigest(
      [role({ title: 'Surgeon <script>alert("x")</script>' })],
      [],
      run,
      OPTS
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  test("a quiet week says so instead of sending an empty list", () => {
    const { json, html } = buildDigest([role({ isNew: false })], [], run, OPTS);
    expect(json.counts.newThisRun).toBe(0);
    expect(html).toContain("Nothing new this week");
  });

  test("remote posts read as Remote rather than a blank location", () => {
    const { json } = buildDigest(
      [role({ geo: { city: null, region: null, country: null }, workModel: "remote" })],
      [],
      run,
      OPTS
    );
    expect(json.newVascular[0].location).toBe("Remote");
  });

  test("the list is capped so the email stays readable", () => {
    const many = Array.from({ length: 30 }, (_, i) => role({ id: `r${i}`, score: 50 + i }));
    const { json } = buildDigest(many, [], run, { ...OPTS, cap: 12 });
    expect(json.newVascular).toHaveLength(12);
    expect(json.counts.newVascular).toBe(30); // the count stays honest
  });
});
