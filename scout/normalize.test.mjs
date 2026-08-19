import { describe, expect, test } from "vitest";
import { extractLocation, fingerprintOf, normalizeAll } from "./normalize.mjs";

const TODAY = "2026-08-09";

const source = (over = {}) => ({
  name: "Example Board",
  url: "https://example.org/jobs",
  category: "society-board",
  ...over,
});

const posting = (over = {}) => ({
  title: "Diagnostic Radiologist",
  org: "Example Health",
  location: "Cleveland, OH",
  description: "A full-time diagnostic radiology post with a partnership track.",
  url: "https://example.org/jobs/1",
  datePosted: "2026-08-01",
  department: "Radiology",
  ...over,
});

describe("extractLocation", () => {
  test("prefers an explicit location field", () => {
    expect(extractLocation(posting({ location: "Doha, Qatar" }))).toBe("Doha, Qatar");
  });

  test("falls back to a location in the title", () => {
    expect(
      extractLocation(posting({ location: "", title: "Vascular Surgeon — Rochester, NY" }))
    ).toBe("Rochester, NY");
  });

  test("reads a parenthesised location in the title", () => {
    expect(
      extractLocation(posting({ location: "", title: "Radiologist (Abu Dhabi, UAE)" }))
    ).toBe("Abu Dhabi, UAE");
  });

  test("falls back to a Location: line in the body", () => {
    expect(
      extractLocation(
        posting({ location: "", title: "Consultant Radiologist", description: "Location: Riyadh, Saudi Arabia" })
      )
    ).toBe("Riyadh, Saudi Arabia");
  });

  test("treats placeholder locations as absent", () => {
    expect(extractLocation(posting({ location: "Various", title: "Radiologist" }))).toBe("");
  });
});

describe("extractLocation — inference from prose", () => {
  // Society and specialty-board RSS feeds carry no location field at all.
  const fromBody = (description, title = "Diagnostic Radiologist") =>
    extractLocation({ title, location: "", description });

  test("finds City, ST written in the body", () => {
    expect(fromBody("A private group serving Tyler, TX and the surrounding region.")).toBe("Tyler, TX");
  });

  test("finds a spelled-out state", () => {
    expect(fromBody("Hybrid role in Tyler, Texas with a physician-owned practice.")).toBe("Tyler, Texas");
  });

  test("finds a bare major city", () => {
    expect(fromBody("On-site work in the greater Orlando area.")).toBe("Orlando");
  });

  test("finds a Gulf city", () => {
    expect(fromBody("Consultant post based at our Doha campus.")).toBe("Doha");
  });

  test("ignores capitalised words that are not places", () => {
    // "Board Certified" and "MD" must not become a location.
    expect(fromBody("Board Certified or Board Eligible, MD or DO required.")).toBe("");
  });

  test("rejects a small same-named town when only a bare word is present", () => {
    // Below the population floor, so it must not be treated as a place.
    expect(fromBody("Candidates must show Initiative and Independence.")).toBe("");
  });
});

describe("employer inference", () => {
  const orgFor = (title) => {
    const { roles } = normalizeAll(
      [
        {
          source: source({ name: "RadWorking.com", category: "aggregator" }),
          postings: [posting({ title, org: "RadWorking.com", location: "Cleveland, OH" })],
        },
      ],
      { today: TODAY }
    );
    return roles[0]?.org ?? null;
  };

  test.each([
    ["Select Radiology Solutions: On-site Breast Imaging Radiologist", "Select Radiology Solutions"],
    ["Radiology Associates Imaging (Daytona Beach, FL) | Remote Radiologist", "Radiology Associates Imaging"],
    ["Diagnostic Imaging Services: On-site Diagnostic Radiologist", "Diagnostic Imaging Services"],
  ])("reads a real practice name out of %s", (title, expected) => {
    expect(orgFor(title)).toBe(expected);
  });

  test.each([
    "Radiology - MSK or Body Imaging | Dallas, TX",
    "Diagnostic Radiology | No Call | Earnings",
    "Build & Lead an Onsite Breast Imaging Program | Florida",
    "Diagnostic Radiology - Hybrid | Great Lakes Coastal Town",
  ])("refuses to invent an employer from %s", (title) => {
    // Blank is honest; a specialty or a marketing headline presented as the
    // employer would also corrupt the same-employer signal in the pair engine.
    expect(orgFor(title)).toBe("");
  });

  test("never passes the job board off as the employer", () => {
    expect(orgFor("Radiologist Opportunity")).toBe("");
  });

  test("strips the employer from the title once it has been extracted", () => {
    const { roles } = normalizeAll(
      [
        {
          source: source({ name: "RadWorking.com", category: "aggregator" }),
          postings: [
            posting({
              title: "Select Radiology Solutions: On-site Breast Imaging Radiologist",
              org: "RadWorking.com",
              location: "Cleveland, OH",
            }),
          ],
        },
      ],
      { today: TODAY }
    );
    expect(roles[0].title).toBe("On-site Breast Imaging Radiologist");
  });
});

describe("fingerprintOf", () => {
  test("ignores corporate boilerplate in the employer name", () => {
    expect(fingerprintOf("Cleveland Clinic Health System", "Vascular Surgeon", "Cleveland")).toBe(
      fingerprintOf("Cleveland Clinic", "Vascular Surgeon", "Cleveland")
    );
  });

  test("the same title at two sites is two different jobs", () => {
    expect(fingerprintOf("Acme Health", "Radiologist", "Cleveland")).not.toBe(
      fingerprintOf("Acme Health", "Radiologist", "Akron")
    );
  });
});

describe("expired postings", () => {
  const daysAgo = (n) => new Date(Date.parse(TODAY) - n * 86_400_000).toISOString().slice(0, 10);

  test("drops a posting older than eighteen months", () => {
    // RadWorking was serving live-looking ads dated 2018.
    const { roles, stats } = normalizeAll(
      [{ source: source(), postings: [posting({ datePosted: "2018-11-02" })] }],
      { today: TODAY }
    );
    expect(roles).toHaveLength(0);
    expect(stats.expired).toBe(1);
  });

  test("keeps one just inside the cutoff", () => {
    const { roles } = normalizeAll(
      [{ source: source(), postings: [posting({ datePosted: daysAgo(540) })] }],
      { today: TODAY }
    );
    expect(roles).toHaveLength(1);
  });

  test("never drops an undated posting — a missing date is not an old date", () => {
    const { roles, stats } = normalizeAll(
      [{ source: source(), postings: [posting({ datePosted: null })] }],
      { today: TODAY }
    );
    expect(roles).toHaveLength(1);
    expect(stats.expired).toBe(0);
  });
});

describe("normalizeAll", () => {
  test("keeps relevant attending posts and drops the rest", () => {
    const { roles, stats } = normalizeAll(
      [
        {
          source: source(),
          postings: [
            posting(),
            posting({ title: "Radiology Technologist", url: "https://example.org/jobs/2" }),
            posting({ title: "Radiology Resident", url: "https://example.org/jobs/3" }),
          ],
        },
      ],
      { today: TODAY }
    );
    expect(roles).toHaveLength(1);
    expect(stats.irrelevant).toBe(2);
    expect(roles[0].specialty).toBe("radiology");
    expect(roles[0].geo.city).toBe("Cleveland");
    expect(roles[0].score).toBeGreaterThan(0);
  });

  test("merges the same job seen on two boards and keeps the employer's link", () => {
    const { roles, stats } = normalizeAll(
      [
        {
          source: source({ name: "Aggregator", category: "aggregator" }),
          postings: [posting({ url: "https://aggregator.example/redirect/1" })],
        },
        {
          source: source({ name: "Employer ATS", category: "health-system" }),
          postings: [posting({ url: "https://employer.example/careers/1" })],
        },
      ],
      { today: TODAY }
    );
    expect(roles).toHaveLength(1);
    expect(stats.duplicates).toBe(1);
    expect(roles[0].source.name).toBe("Employer ATS");
    expect(roles[0].alsoSeenOn.map((s) => s.name)).toContain("Aggregator");
  });

  test("strips a trailing location from the displayed title", () => {
    const { roles } = normalizeAll(
      [
        {
          source: source(),
          postings: [posting({ location: "", title: "Vascular Surgeon — Rochester, NY" })],
        },
      ],
      { today: TODAY }
    );
    expect(roles[0].title).toBe("Vascular Surgeon");
    expect(roles[0].geo.city).toBe("Rochester");
  });

  test("counts postings it could not place", () => {
    const { stats } = normalizeAll(
      [{ source: source(), postings: [posting({ location: "Various", title: "Radiologist" })] }],
      { today: TODAY }
    );
    expect(stats.unlocated).toBe(1);
  });

  test("returns roles sorted best-first", () => {
    const { roles } = normalizeAll(
      [
        {
          source: source(),
          postings: [
            posting({ title: "Radiologist", url: "https://example.org/a", description: "x" }),
            posting({
              title: "Chief of Diagnostic Radiology",
              url: "https://example.org/b",
              org: "University Example School of Medicine",
              description:
                "General diagnostic radiology leadership post at a Level I trauma centre with partnership track and no overnight call. ".repeat(
                  12
                ),
            }),
          ],
        },
      ],
      { today: TODAY }
    );
    expect(roles[0].title).toContain("Chief");
    expect(roles[0].score).toBeGreaterThan(roles[1].score);
  });
});
