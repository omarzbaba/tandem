/**
 * Pins, statuses and notes — shared between the two of them.
 *
 * Two backends behind one interface:
 *   Shared — talks to this app's own /api/marks function, which holds the
 *            database credential server-side. The browser therefore ships with
 *            no key of any kind; the only thing the page knows is an
 *            unguessable board id. Both partners see the same board on every
 *            device.
 *   Local  — otherwise, marks live in localStorage. The board is fully usable
 *            with no backend at all, and gains syncing the moment it is
 *            deployed somewhere that can run the function.
 *
 * Writes are optimistic and last-write-wins. For two people casually pinning
 * jobs that is the right trade: no conflict UI, no locking, and the worst case
 * is one of them re-pinning a row.
 */

import type { Marks, RoleMark } from "./types";
import { EMPTY_MARK } from "./types";

const STORAGE_KEY = "tandem:marks:v1";
const WHO_KEY = "tandem:who:v1";

export interface RemoteConfig {
  /** Turn on the shared board. Requires the app to be deployed with /api/marks. */
  sharedBoard?: boolean;
  /** Unguessable id that both partners share. It is the only secret the page holds. */
  boardId?: string;
  partnerALabel?: string;
  partnerBLabel?: string;
}

export interface SharedStateBackend {
  readonly kind: "shared" | "local";
  load(): Promise<Marks>;
  save(roleId: string, mark: RoleMark): Promise<void>;
}

/** Which partner is using this browser — stamped onto every mark. */
export function getWho(): string {
  try {
    return localStorage.getItem(WHO_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setWho(who: string): void {
  try {
    localStorage.setItem(WHO_KEY, who);
  } catch {
    /* private browsing — marks simply will not persist locally */
  }
}

function readLocal(): Marks {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Marks) : {};
  } catch {
    return {};
  }
}

function writeLocal(marks: Marks): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
  } catch {
    /* quota or private mode — the in-memory copy still drives this session */
  }
}

class LocalBackend implements SharedStateBackend {
  readonly kind = "local" as const;

  async load(): Promise<Marks> {
    return readLocal();
  }

  async save(roleId: string, mark: RoleMark): Promise<void> {
    writeLocal({ ...readLocal(), [roleId]: mark });
  }
}

/**
 * Talks to this app's own /api/marks route. The database credential lives in
 * that function's environment, so nothing sensitive is ever shipped to the
 * browser — the page holds only the board id.
 */
class ApiBackend implements SharedStateBackend {
  readonly kind = "shared" as const;

  constructor(private readonly boardId: string) {}

  async load(): Promise<Marks> {
    const res = await fetch(`${API_ROUTE}?board=${encodeURIComponent(this.boardId)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(await describe(res));
    const body = (await res.json()) as { marks?: Marks };
    return body.marks ?? {};
  }

  async save(roleId: string, mark: RoleMark): Promise<void> {
    const res = await fetch(API_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boardId: this.boardId, roleId, ...mark }),
    });
    if (!res.ok) throw new Error(await describe(res));
  }
}

const API_ROUTE = "/api/marks";

async function describe(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * Picks a backend from the runtime config.
 *
 * `sharedBoardId` turns on the shared board. Without it — or on a static host
 * with no API route — marks stay in this browser, so the page is always usable
 * and simply gains syncing once it is deployed somewhere that can run the
 * function.
 */
export function createBackend(config: RemoteConfig | null): SharedStateBackend {
  const boardId = config?.boardId?.trim();
  if (config?.sharedBoard && boardId && boardId.length >= 8) {
    return new ApiBackend(boardId);
  }
  return new LocalBackend();
}

export { EMPTY_MARK };
