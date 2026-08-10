import { describe, expect, test } from "vitest";
import { geocode, haversineMiles, estimatedDriveMinutes, isPinpoint } from "./geocode.mjs";

describe("geocode — US postings", () => {
  test("resolves City, ST to a specific city", () => {
    const g = geocode("Rochester, NY");
    expect(g.precision).toBe("city");
    expect(g.city).toBe("Rochester");
    expect(g.region).toBe("NY");
    expect(g.lat).toBeCloseTo(43.15, 1);
  });

  test("resolves the spelled-out state form to the same place", () => {
    // `raw` deliberately preserves the input string, so compare the resolution.
    const { raw: _a, ...spelled } = geocode("Rochester, New York, United States");
    const { raw: _b, ...abbreviated } = geocode("Rochester, NY");
    expect(spelled).toEqual(abbreviated);
  });

  test("does not confuse St. Louis, MO with Saint Louis, MI", () => {
    const g = geocode("St. Louis, MO");
    expect(g.region).toBe("MO");
    expect(geocode("Saint Louis, MO").lat).toBe(g.lat);
  });

  test("resolves abbreviated Mount/Fort prefixes", () => {
    expect(geocode("Mt. Pleasant, SC").city).toBe("Mount Pleasant");
    expect(geocode("Ft. Worth, TX").city).toBe("Fort Worth");
  });

  test("takes the first site when a posting lists several", () => {
    expect(geocode("Cleveland, OH; Akron, OH").city).toBe("Cleveland");
  });

  test("keeps the anchor city out of a hybrid-remote string", () => {
    const g = geocode("Remote - Chicago, IL");
    expect(g.city).toBe("Chicago");
    expect(g.precision).toBe("city");
  });
});

describe("geocode — a named state is binding", () => {
  test("small hospital towns resolve inside their own state", () => {
    // Danville PA (pop ~4,600) is Geisinger's flagship campus. Before the
    // gazetteer floor was lowered it fell through to Danville, CALIFORNIA and
    // dragged a whole Pennsylvania health system onto the wrong coast.
    const g = geocode("Danville, PA");
    expect(g.precision).toBe("city");
    expect(g.region).toBe("PA");
    expect(g.lon).toBeLessThan(-70);
    expect(g.lon).toBeGreaterThan(-80);
  });

  test("same-named towns in different states stay distinct", () => {
    expect(geocode("Hayward, WI").region).toBe("WI");
    expect(geocode("Hayward, CA").region).toBe("CA");
    expect(geocode("Danville, PA").lat).not.toBe(geocode("Danville, CA").lat);
  });

  test("an unknown city in a known state degrades to the state, never to another state", () => {
    const g = geocode("Nowheresville, PA");
    expect(g.precision).toBe("region");
    expect(g.region).toBe("PA");
    expect(g.city).toBeNull();
  });
});

describe("geocode — precision honesty", () => {
  test("a bare state stays at region precision and never becomes a same-named city", () => {
    const g = geocode("Texas");
    expect(g.precision).toBe("region");
    expect(g.region).toBe("TX");
    expect(g.city).toBeNull();
  });

  test("a bare country stays at country precision", () => {
    const g = geocode("Saudi Arabia");
    expect(g.precision).toBe("country");
    expect(g.country).toBe("SA");
    expect(g.city).toBeNull();
  });

  test("pure remote yields no coordinates", () => {
    const g = geocode("Remote");
    expect(g.precision).toBe("remote");
    expect(g.lat).toBeNull();
  });

  test("boilerplate yields nothing rather than a wrong guess", () => {
    expect(geocode("Multiple Locations").precision).toBe("none");
    expect(geocode("").precision).toBe("none");
  });

  test("isPinpoint gates on city precision only", () => {
    expect(isPinpoint(geocode("Rochester, NY"))).toBe(true);
    expect(isPinpoint(geocode("Texas"))).toBe(false);
    expect(isPinpoint(geocode("Qatar"))).toBe(false);
  });
});

describe("geocode — Gulf transliteration", () => {
  test.each([
    ["Doha, Qatar", "QA"],
    ["Abu Dhabi, United Arab Emirates", "AE"],
    ["Riyadh, Saudi Arabia", "SA"],
    ["Manama, Bahrain", "BH"],
    ["Muscat, Oman", "OM"],
  ])("%s resolves to a city in %s", (input, country) => {
    const g = geocode(input);
    expect(g.precision).toBe("city");
    expect(g.country).toBe(country);
  });

  test("the Arabic definite article is optional", () => {
    expect(geocode("Al Khobar, Saudi Arabia").lat).toBe(geocode("Khobar").lat);
  });

  test("sun-letter assimilation matches the plain form", () => {
    expect(geocode("Al Rayyan, Qatar").lat).toBe(geocode("Ar Rayyan, Qatar").lat);
  });

  test("common alternate spellings resolve", () => {
    expect(geocode("Makkah, KSA").precision).toBe("city");
    expect(geocode("Al Ahsa, Saudi Arabia").precision).toBe("city");
  });
});

describe("distance", () => {
  test("Rochester to Buffalo is about 66 miles", () => {
    const d = haversineMiles(geocode("Rochester, NY"), geocode("Buffalo, NY"));
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(72);
  });

  test("distance is zero for the same point and null for an unknown one", () => {
    const roc = geocode("Rochester, NY");
    expect(haversineMiles(roc, roc)).toBe(0);
    expect(haversineMiles(roc, geocode("Remote"))).toBeNull();
  });

  test("drive-time estimate applies a road-circuity factor", () => {
    // 35 straight-line miles → 35 * 1.25 / 35 mph = 1.25 h = 75 min.
    expect(estimatedDriveMinutes(35)).toBe(75);
    expect(estimatedDriveMinutes(null)).toBeNull();
  });
});
