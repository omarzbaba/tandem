import { describe, expect, test } from "vitest";
import { buildMetros, buildPairs, DEFAULT_RADIUS_MILES } from "./pair.mjs";
import { geocode } from "./geocode.mjs";

let seq = 0;
function role(specialty, place, score = 70, org = `Org ${seq}`) {
  seq += 1;
  return { id: `${specialty}-${seq}`, specialty, org, score, geo: geocode(place) };
}

describe("buildPairs", () => {
  test("pairs a vascular and a radiology post in the same city", () => {
    const pairs = buildPairs([role("vascular", "Cleveland, OH"), role("radiology", "Cleveland, OH")]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].miles).toBe(0);
    expect(pairs[0].confidence).toBe("pinpoint");
  });

  test("drops a pair beyond the radius", () => {
    const roles = [role("vascular", "Cleveland, OH"), role("radiology", "Chicago, IL")];
    expect(buildPairs(roles, { radiusMiles: 45 })).toHaveLength(0);
  });

  test("a wider radius admits a pair a narrower one rejects", () => {
    const roles = [role("vascular", "Rochester, NY"), role("radiology", "Buffalo, NY")];
    expect(buildPairs(roles, { radiusMiles: 45 })).toHaveLength(0);
    expect(buildPairs(roles, { radiusMiles: 90 })).toHaveLength(1);
  });

  test("never pairs two posts in the same specialty", () => {
    const roles = [role("vascular", "Cleveland, OH"), role("vascular", "Cleveland, OH")];
    expect(buildPairs(roles)).toHaveLength(0);
  });

  test("one employer hiring both scores above two separate employers", () => {
    const same = buildPairs([
      role("vascular", "Cleveland, OH", 70, "Cleveland Clinic"),
      role("radiology", "Cleveland, OH", 70, "Cleveland Clinic"),
    ]);
    const apart = buildPairs([
      role("vascular", "Cleveland, OH", 70, "Alpha Health"),
      role("radiology", "Cleveland, OH", 70, "Beta Health"),
    ]);
    expect(same[0].sameOrg).toBe(true);
    expect(apart[0].sameOrg).toBe(false);
    expect(same[0].score).toBeGreaterThan(apart[0].score);
  });

  test("an imbalanced pair scores below a balanced pair of the same total", () => {
    const balanced = buildPairs([
      role("vascular", "Cleveland, OH", 60, "A"),
      role("radiology", "Cleveland, OH", 60, "B"),
    ]);
    const lopsided = buildPairs([
      role("vascular", "Cleveland, OH", 95, "C"),
      role("radiology", "Cleveland, OH", 25, "D"),
    ]);
    expect(balanced[0].score).toBeGreaterThan(lopsided[0].score);
  });

  test("a state-level location is marked approximate, not pinpoint", () => {
    const pairs = buildPairs([role("vascular", "Ohio"), role("radiology", "Ohio")]);
    expect(pairs[0].confidence).toBe("approximate");
  });

  test("small Gulf states pair at country scale", () => {
    const pairs = buildPairs([role("vascular", "Qatar"), role("radiology", "Qatar")]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].confidence).toBe("country-scale");
  });

  test("two big-country centroids do not become a commute", () => {
    const pairs = buildPairs([role("vascular", "Saudi Arabia"), role("radiology", "Saudi Arabia")]);
    // Same centroid, so distance is 0 and it is admitted — but it must not
    // claim pinpoint confidence.
    expect(pairs[0].confidence).toBe("approximate");
  });

  test("unlocated posts are skipped", () => {
    expect(buildPairs([role("vascular", "Remote"), role("radiology", "Remote")])).toHaveLength(0);
  });
});

describe("buildMetros", () => {
  test("groups nearby posts into one area with both sides", () => {
    const metros = buildMetros([
      role("vascular", "Cleveland, OH"),
      role("radiology", "Akron, OH"),
      role("radiology", "Cleveland, OH"),
    ]);
    const together = metros.filter((m) => m.isTogether);
    expect(together).toHaveLength(1);
    expect(together[0].vascularCount).toBe(1);
    expect(together[0].radiologyCount).toBe(2);
  });

  test("names the area after its largest city", () => {
    const metros = buildMetros([role("vascular", "Akron, OH"), role("radiology", "Cleveland, OH")]);
    expect(metros[0].label).toBe("Cleveland, OH");
  });

  test("a one-sided area is reported with the side that is missing", () => {
    const metros = buildMetros([role("vascular", "Boise, ID")]);
    expect(metros[0].isTogether).toBe(false);
    expect(metros[0].missingSide).toBe("radiology");
  });

  test("distant posts stay in separate areas", () => {
    const metros = buildMetros([role("vascular", "Cleveland, OH"), role("radiology", "Seattle, WA")]);
    expect(metros).toHaveLength(2);
    expect(metros.every((m) => !m.isTogether)).toBe(true);
  });

  test("depth on both sides raises the score over a single pair", () => {
    const shallow = buildMetros([
      role("vascular", "Denver, CO", 70, "A"),
      role("radiology", "Denver, CO", 70, "B"),
    ]).find((m) => m.isTogether);
    const deep = buildMetros([
      role("vascular", "Denver, CO", 70, "A"),
      role("vascular", "Denver, CO", 70, "B"),
      role("radiology", "Denver, CO", 70, "C"),
      role("radiology", "Denver, CO", 70, "D"),
    ]).find((m) => m.isTogether);
    expect(deep.score).toBeGreaterThan(shallow.score);
  });

  test("span reports the widest separation inside the area", () => {
    const metros = buildMetros(
      [role("vascular", "Cleveland, OH"), role("radiology", "Akron, OH")],
      { radiusMiles: 60 }
    );
    expect(metros[0].spanMiles).toBeGreaterThan(20);
    expect(metros[0].spanMiles).toBeLessThan(45);
  });

  test("the default radius is a plausible commute", () => {
    expect(DEFAULT_RADIUS_MILES).toBeGreaterThan(20);
    expect(DEFAULT_RADIUS_MILES).toBeLessThan(100);
  });
});
