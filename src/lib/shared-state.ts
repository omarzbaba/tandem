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
const CODE_KEY = "tandem:code:v1";

/**
 * The access code, entered once per device on the gate screen and held in
 * localStorage from then on. It is the only credential in the app: the server
 * checks it on every read and write, and it never appears in the bundle.
 */
export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string): void {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {
    /* private browsing — they will be asked again next visit */
  }
}

export function clearAccessCode(): void {
  try {
    localStorage.removeItem(CODE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Ask the server whether a code is right, without saving anything. */
export async function verifyAccessCode(code: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(`${API_ROUTE}?board=${encodeURIComponent(code)}`, {
      headers: { accept: "application/json" },
    });
    if (res.ok) return { ok: true, error: null };
    if (res.status === 403) return { ok: false, error: "That code is not right — check it and try again." };
    return { ok: false, error: `The board is not reachable right now (HTTP ${res.status}).` };
  } catch {
    return { ok: false, error: "Could not reach the board — check your connection." };
  }
}

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
    if (res.status === 403) throw new CodeRejectedError(await describe(res));
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
    if (res.status === 403) throw new CodeRejectedError(await describe(res));
    if (!res.ok) throw new Error(await describe(res));
  }
}

const API_ROUTE = "/api/marks";

/**
 * The server refused the stored code. Distinct from a network or server
 * failure because the remedies are opposites: a flaky network deserves a
 * retry; a rejected code means this device must go back to the gate.
 */
export class CodeRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodeRejectedError";
  }
}

async function describe(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * The stored access code decides the backend: with one, marks live on the
 * shared board; without one (or in local dev, where there is no API route),
 * they stay in this browser.
 */
export function createBackend(accessCode: string | null): SharedStateBackend {
  // `vite dev` has no serverless routes, so /api/marks resolves to the raw
  // source file and parsing it throws a confusing JSON error. Local runs use
  // browser storage; the shared path is exercised against a deployment.
  if (import.meta.env.DEV) return new LocalBackend();
  const code = accessCode?.trim();
  if (code && code.length >= 4) return new ApiBackend(code);
  return new LocalBackend();
}

export { EMPTY_MARK };
