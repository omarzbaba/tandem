import { describe, expect, test } from "vitest";
import { applyFilters, countUndated, DEFAULT_FILTERS, sortRoles } from "./RoleList";
import type { Role } from "../../lib/types";

const role = (id: string, score: number, ageDays: number | null): Role =>
  ({
    id,
    title: id,
    org: "Example",
    specialty: "radiology",
    score,
    ageDays,
    setting: "private",
    workModel: "onsite",
    locationText: "Cleveland, OH",
    description: "",
    geo: { lat: 41.5, lon: -81.7, city: "Cleveland", region: "OH", country: "US", precision: "city", raw: "" },
  }) as unknown as Role;

describe("sortRoles", () => {
  const roles = [role("old", 90, 300), role("new", 40, 2), role("mid", 70, 30), role("undated", 80, null)];

  test("best fit orders by score", () => {
    expect(sortRoles(roles, "fit").map((r) => r.id)).toEqual(["old", "undated", "mid", "new"]);
  });

  test("newest puts the freshest first", () => {
    expect(sortRoles(roles, "newest").map((r) => r.id)).toEqual(["new", "mid", "old", "undated"]);
  });

  test("oldest reverses it", () => {
    expect(sortRoles(roles, "oldest").map((r) => r.id)).toEqual(["old", "mid", "new", "undated"]);
  });

  test("undated posts sort last under BOTH date orders", () => {
    // Treating an unknown date as either brand new or ancient would be a claim
    // the data cannot support, so it goes to the end either way.
    expect(sortRoles(roles, "newest").at(-1)!.id).toBe("undated");
    expect(sortRoles(roles, "oldest").at(-1)!.id).toBe("undated");
  });

  test("does not mutate the input", () => {
    const input = [...roles];
    sortRoles(input, "newest");
    expect(input.map((r) => r.id)).toEqual(roles.map((r) => r.id));
  });
});

describe("postedWithin filter", () => {
  const roles = [role("fresh", 50, 3), role("stale", 50, 200), role("undated", 50, null)];

  test("any time keeps everything", () => {
    expect(applyFilters(roles, DEFAULT_FILTERS)).toHaveLength(3);
  });

  test("past week keeps only the fresh one", () => {
    const kept = applyFilters(roles, { ...DEFAULT_FILTERS, postedWithin: 7 });
    expect(kept.map((r) => r.id)).toEqual(["fresh"]);
  });

  test("an undated post cannot satisfy an age filter, and is counted", () => {
    const f = { ...DEFAULT_FILTERS, postedWithin: 7 };
    expect(applyFilters(roles, f).some((r) => r.id === "undated")).toBe(false);
    expect(countUndated(roles, f)).toBe(1);
  });

  test("nothing is reported as held back when no age filter is set", () => {
    expect(countUndated(roles, DEFAULT_FILTERS)).toBe(0);
  });
});
