import { useCallback, useEffect, useState } from "react";

/**
 * Whether this person has already been walked through the board.
 *
 * Keyed per person, like the notification read-state: if Rachad dismisses the
 * tour, Samia should still get it on her first visit even on the same laptop.
 * Stored locally rather than server-side — "have I seen the tutorial" is a
 * property of a person on a device, not of the shared board.
 */

const SEEN_KEY_PREFIX = "tandem:tour-seen:v1:";

function keyFor(who: string) {
  return `${SEEN_KEY_PREFIX}${who || "anon"}`;
}

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return true; // no storage → never nag
  }
}

export function useTour(who: string, ready: boolean) {
  const key = keyFor(who);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    setSeen(read(key));
  }, [key]);

  // Offer it once, and only once the board actually has something to point at —
  // a tour highlighting empty space teaches nothing.
  useEffect(() => {
    if (ready && !seen) setOpen(true);
  }, [ready, seen]);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private browsing — it will offer again next visit */
    }
    setSeen(true);
  }, [key]);

  const start = useCallback(() => setOpen(true), []);

  /** Closing without "don't show again" leaves it to reappear next visit. */
  const close = useCallback(() => setOpen(false), []);

  const finish = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  return { open, start, close, finish, seen };
}
