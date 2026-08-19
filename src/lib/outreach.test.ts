import { describe, expect, test } from "vitest";
import { buildOutreachEmail, extractContacts, mailtoUrl, type OutreachIdentity } from "./outreach";
import type { Role } from "./types";

const ME: OutreachIdentity = {
  name: "Dr A. Example",
  credentials: "MD",
  specialty: "vascular surgery",
  currentRole: "an attending physician looking to relocate",
  partnerLine: "My spouse is a diagnostic radiology attending.",
};

const role = (description: string, over: Partial<Role> = {}): Role =>
  ({
    id: "x",
    title: "Vascular Surgeon",
    org: "Riverside Health",
    description,
    source: { name: "SVS JobBoard", url: "https://example.org", category: "society-board" },
    geo: {
      lat: 41.5,
      lon: -81.7,
      city: "Cleveland",
      region: "OH",
      country: "US",
      precision: "city",
      raw: "Cleveland, OH",
    },
    ...over,
  }) as Role;

describe("extractContacts", () => {
  test("finds a recruiter email and a phone number", () => {
    const c = extractContacts(role("Contact Jane at jane.doe@riversidehealth.org or (216) 555-0142."));
    expect(c.emails).toEqual(["jane.doe@riversidehealth.org"]);
    expect(c.phones).toEqual(["(216) 555-0142"]);
  });

  test("drops automated and reserved-domain addresses", () => {
    const c = extractContacts(
      role("Write to noreply@riversidehealth.org, privacy@riversidehealth.org or careers@example.org.")
    );
    expect(c.emails).toEqual([]);
  });

  test("ignores bare digit runs that are not phone numbers", () => {
    // NPI and licence numbers are 10 digits with no separators.
    const c = extractContacts(role("Applicants must supply NPI 1234567890 at interview."));
    expect(c.phones).toEqual([]);
  });

  test("finds an international Gulf number", () => {
    const c = extractContacts(role("Call +974 4439 1234 to discuss."));
    expect(c.phones.length).toBeGreaterThan(0);
  });

  test("returns empty lists rather than throwing on an empty posting", () => {
    expect(extractContacts(role(""))).toEqual({ emails: [], phones: [] });
  });
});

describe("buildOutreachEmail", () => {
  test("names the role, the place and where it was found", () => {
    const { subject, body } = buildOutreachEmail(role("A vascular post."), ME);
    expect(subject).toContain("Vascular Surgeon");
    expect(body).toContain("Riverside Health");
    expect(body).toContain("Cleveland, OH");
    expect(body).toContain("SVS JobBoard");
  });

  test("leads with the two-body situation, which is the point of the enquiry", () => {
    const { body } = buildOutreachEmail(role("A vascular post."), ME);
    expect(body).toContain("My spouse is a diagnostic radiology attending.");
    expect(body).toContain("both of us in the same area");
  });

  test("falls back gracefully when the location is unknown", () => {
    const unlocated = role("A post.", {
      geo: { lat: null, lon: null, city: null, region: null, country: null, precision: "none", raw: "" },
    });
    expect(buildOutreachEmail(unlocated, ME).body).toContain("your area");
  });
});

describe("mailtoUrl", () => {
  test("encodes spaces as %20 so mail clients do not render plus signs", () => {
    const url = mailtoUrl("a@b.org", "Hello there", "Line one\nLine two");
    expect(url.startsWith("mailto:a@b.org?")).toBe(true);
    expect(url).toContain("Hello%20there");
    expect(url).not.toContain("+");
  });

  test("still builds a usable draft when no recipient was found", () => {
    expect(mailtoUrl(undefined, "S", "B").startsWith("mailto:?")).toBe(true);
  });
});

describe("formatRunTime", () => {
  test("a date-only value renders as that same calendar day", async () => {
    // Parsed as UTC midnight then rendered locally, "2026-08-19" showed as the
    // 18th to anyone west of Greenwich — the notification panel dated every
    // batch a day early.
    const { formatRunTime } = await import("./format");
    expect(formatRunTime("2026-08-19")).toContain("19");
  });

  test("a full timestamp still renders its own instant", async () => {
    const { formatRunTime } = await import("./format");
    expect(formatRunTime("2026-08-19T14:00:00.000Z")).toContain("19");
  });

  test("an unparseable value says so rather than throwing", async () => {
    const { formatRunTime } = await import("./format");
    expect(formatRunTime("not a date")).toBe("unknown");
  });
});
