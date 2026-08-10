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

describe("remote radiology unlocks the map", () => {
  // Diagnostic radiology reads from anywhere; vascular surgery does not. One
  // remote radiology post therefore makes every surgical opening workable,
  // which is a much larger opportunity space than physical co-location.
  const remoteRad = (score = 70) => ({
    id: `rad-remote-${score}`,
    specialty: "radiology",
    org: "National Reads",
    score,
    workModel: "remote",
    geo: geocode("Remote"),
  });

  const onsite = (specialty, place, score = 70) => ({
    ...role(specialty, place, score),
    workModel: "onsite",
  });

  test("a remote radiology post pairs with a surgical job anywhere", () => {
    const pairs = buildPairs([onsite("vascular", "Boise, ID"), remoteRad()]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].remotePartner).toBe(true);
    expect(pairs[0].miles).toBeNull();
    expect(pairs[0].confidence).toBe("remote-partner");
  });

  test("it pairs with every surgical location, not just nearby ones", () => {
    const pairs = buildPairs([
      onsite("vascular", "Boise, ID"),
      onsite("vascular", "Miami, FL"),
      onsite("vascular", "Bangor, ME"),
      remoteRad(),
    ]);
    expect(pairs.filter((p) => p.remotePartner)).toHaveLength(3);
  });

  test("a remote pair outscores a mediocre on-site pair of the same quality", () => {
    // Removing the geographic constraint entirely is worth a premium.
    const remote = buildPairs([onsite("vascular", "Boise, ID", 70), remoteRad(70)]);
    const onsitePair = buildPairs([
      onsite("vascular", "Cleveland, OH", 70),
      { ...onsite("radiology", "Akron, OH", 70), org: "Other" },
    ]);
    expect(remote[0].score).toBeGreaterThan(onsitePair[0].score);
  });

  test("a metro with only a surgical post is flagged as remote-unlocked", () => {
    const metros = buildMetros([onsite("vascular", "Boise, ID"), remoteRad()]);
    const boise = metros.find((m) => m.label.startsWith("Boise"));
    expect(boise.isTogether).toBe(false);
    expect(boise.remoteUnlocked).toBe(true);
    expect(boise.remotePartnerCount).toBe(1);
  });

  test("remote-unlocked is never conflated with both being on site", () => {
    // The board must not imply two people are working in the same building
    // when one of them is reading from home.
    const metros = buildMetros([onsite("vascular", "Boise, ID"), remoteRad()]);
    const boise = metros.find((m) => m.label.startsWith("Boise"));
    expect(boise.isTogether).toBe(false);
    expect(boise.radiologyCount).toBe(0);
  });

  test("a radiology-only metro is not remote-unlocked — she cannot cover his side", () => {
    const metros = buildMetros([onsite("radiology", "Boise, ID"), remoteRad()]);
    const boise = metros.find((m) => m.label.startsWith("Boise"));
    expect(boise.remoteUnlocked).toBe(false);
  });

  test("with no remote posts available nothing is unlocked", () => {
    const metros = buildMetros([onsite("vascular", "Boise, ID")]);
    expect(metros[0].remoteUnlocked).toBe(false);
    expect(metros[0].remotePartnerCount).toBe(0);
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
