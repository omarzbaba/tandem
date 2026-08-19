import { useCallback, useEffect, useMemo, useState } from "react";
import type { Metro, Role } from "../lib/types";

/**
 * "What appeared since I last looked."
 *
 * Read state is per person and per device. Two people share this board, so
 * Rachad opening the panel must not clear Samia's badge — the key is scoped to
 * whoever is signed in on this browser. It is deliberately NOT stored server
 * side: a shared read-state would mean whoever checks first silently consumes
 * the other's notifications, which is worse than the mild cost of marking
 * things read twice across two devices.
 *
 * Comparison is by date rather than timestamp because the harvest is weekly —
 * day granularity is more than enough and keeps the stored value legible.
 */

const SEEN_KEY_PREFIX = "tandem:seen:v1:";

function keyFor(who: string) {
  return `${SEEN_KEY_PREFIX}${who || "anon"}`;
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private browsing — the badge simply will not persist */
  }
}

export interface NotificationGroup {
  date: string;
  roles: Role[];
}

/** Postings that landed after the reader last acknowledged the panel. */
export function selectUnread(roles: Role[], lastSeen: string): Role[] {
  if (!lastSeen) return [];
  return roles
    .filter((r) => r.firstSeen && r.firstSeen > lastSeen)
    .sort((a, b) => {
      if (a.firstSeen !== b.firstSeen) return (b.firstSeen ?? "").localeCompare(a.firstSeen ?? "");
      return b.score - a.score;
    });
}

/** Grouped by arrival date, newest batch first. */
export function groupByDate(unread: Role[]): NotificationGroup[] {
  const byDate = new Map<string, Role[]>();
  for (const r of unread) {
    const d = r.firstSeen ?? "";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(r);
  }
  return [...byDate.entries()].map(([date, rs]) => ({ date, roles: rs }));
}

/**
 * Areas that became workable for both of them because of these arrivals — the
 * highest-value thing a notification can carry, so it leads the panel.
 */
export function selectNewTogetherAreas(metros: Metro[], unread: Role[]): Metro[] {
  if (!unread.length) return [];
  const unreadIds = new Set(unread.map((r) => r.id));
  return metros
    .filter(
      (m) => m.isTogether && [...m.vascularIds, ...m.radiologyIds].some((id) => unreadIds.has(id))
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export function useNotifications(
  roles: Role[],
  metros: Metro[],
  who: string,
  runToday: string | null
) {
  const key = keyFor(who);
  const [lastSeen, setLastSeen] = useState(() => read(key));

  // Re-read when the signed-in partner changes: each has their own badge.
  useEffect(() => {
    setLastSeen(read(key));
  }, [key]);

  // On a first ever visit there is no read state, and treating the entire
  // board as unread would bury the feature under 500 notifications. Start the
  // clock at the current run instead: the panel fills from the next harvest on.
  useEffect(() => {
    if (!lastSeen && runToday) {
      write(key, runToday);
      setLastSeen(runToday);
    }
  }, [key, lastSeen, runToday]);

  const unread = useMemo(() => selectUnread(roles, lastSeen), [roles, lastSeen]);
  const groups = useMemo(() => groupByDate(unread), [unread]);
  const newTogetherAreas = useMemo(() => selectNewTogetherAreas(metros, unread), [metros, unread]);

  const markAllSeen = useCallback(() => {
    if (!runToday) return;
    write(key, runToday);
    setLastSeen(runToday);
  }, [key, runToday]);

  return {
    unread,
    groups,
    newTogetherAreas,
    unreadCount: unread.length,
    lastSeen,
    markAllSeen,
  };
}
