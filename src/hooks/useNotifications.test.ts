import { describe, expect, test } from "vitest";
import { groupByDate, selectNewTogetherAreas, selectUnread } from "./useNotifications";
import type { Metro, Role } from "../lib/types";

const role = (id: string, firstSeen: string | undefined, score = 50, specialty = "radiology"): Role =>
  ({ id, title: id, org: "Example", specialty, score, firstSeen }) as unknown as Role;

const metro = (key: string, vascularIds: string[], radiologyIds: string[], score = 70): Metro =>
  ({
    key,
    label: key,
    vascularIds,
    radiologyIds,
    vascularCount: vascularIds.length,
    radiologyCount: radiologyIds.length,
    isTogether: vascularIds.length > 0 && radiologyIds.length > 0,
    score,
  }) as unknown as Metro;

describe("selectUnread", () => {
  const roles = [
    role("old", "2026-08-01"),
    role("sameDay", "2026-08-10"),
    role("newer", "2026-08-17", 60),
    role("newest", "2026-08-24", 40),
    role("undated", undefined),
  ];

  test("returns only postings that landed after the last visit", () => {
    expect(selectUnread(roles, "2026-08-10").map((r) => r.id)).toEqual(["newest", "newer"]);
  });

  test("a posting from the exact day last seen is not unread", () => {
    // The reader acknowledged that run, so it must not resurface.
    expect(selectUnread(roles, "2026-08-10").some((r) => r.id === "sameDay")).toBe(false);
  });

  test("catches up over a long absence, not just the last run", () => {
    // Away for three weeks: every batch since should appear.
    expect(selectUnread(roles, "2026-07-01")).toHaveLength(4);
  });

  test("no read state yet means nothing is unread, rather than everything", () => {
    // A first visit must not be buried under the entire board.
    expect(selectUnread(roles, "")).toEqual([]);
  });

  test("postings with no firstSeen are never unread", () => {
    expect(selectUnread(roles, "2026-01-01").some((r) => r.id === "undated")).toBe(false);
  });

  test("newest batch first, best fit within a batch", () => {
    const sameBatch = [
      role("low", "2026-08-24", 30),
      role("high", "2026-08-24", 90),
      role("older", "2026-08-17", 99),
    ];
    expect(selectUnread(sameBatch, "2026-08-01").map((r) => r.id)).toEqual(["high", "low", "older"]);
  });
});

describe("groupByDate", () => {
  test("groups arrivals into batches", () => {
    const groups = groupByDate([
      role("a", "2026-08-24"),
      role("b", "2026-08-24"),
      role("c", "2026-08-17"),
    ]);
    expect(groups.map((g) => [g.date, g.roles.length])).toEqual([
      ["2026-08-24", 2],
      ["2026-08-17", 1],
    ]);
  });
});

describe("selectNewTogetherAreas", () => {
  const metros = [
    metro("Cleveland", ["v1"], ["r1"], 80),
    metro("Denver", ["v2"], ["r2"], 60),
    metro("Boise", ["v3"], []),
  ];

  test("surfaces an area only when one of its roles is unread", () => {
    const unread = [role("r2", "2026-08-24")];
    expect(selectNewTogetherAreas(metros, unread).map((m) => m.key)).toEqual(["Denver"]);
  });

  test("ignores one-sided areas — those are not places both can work", () => {
    const unread = [role("v3", "2026-08-24", 50, "vascular")];
    expect(selectNewTogetherAreas(metros, unread)).toEqual([]);
  });

  test("orders by score and returns nothing when there is no unread", () => {
    const unread = [role("v1", "2026-08-24"), role("r2", "2026-08-24")];
    expect(selectNewTogetherAreas(metros, unread).map((m) => m.key)).toEqual(["Cleveland", "Denver"]);
    expect(selectNewTogetherAreas(metros, [])).toEqual([]);
  });
});
