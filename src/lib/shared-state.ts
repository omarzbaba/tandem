/**
 * Pins, statuses and notes — shared between the two of them.
 *
 * Two backends behind one interface:
 *   Supabase  — when public/config.json carries a project URL + anon key, marks
 *               live in one table and both partners see the same board from any
 *               device. Talks to PostgREST directly rather than pulling in the
 *               supabase-js client, which would cost ~30 KB gzipped for two
 *               endpoints.
 *   Local     — otherwise, marks live in localStorage. The board is fully
 *               usable on day one; syncing turns on the moment keys are added.
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
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  boardId?: string;
  partnerALabel?: string;
  partnerBLabel?: string;
}

export interface SharedStateBackend {
  readonly kind: "supabase" | "local";
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

class SupabaseBackend implements SharedStateBackend {
  readonly kind = "supabase" as const;

  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly boardId: string
  ) {}

  private get endpoint() {
    return `${this.url.replace(/\/+$/, "")}/rest/v1/marks`;
  }

  private get headers() {
    return {
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      "content-type": "application/json",
    };
  }

  async load(): Promise<Marks> {
    const res = await fetch(
      `${this.endpoint}?board_id=eq.${encodeURIComponent(this.boardId)}&select=role_id,pinned,status,note,by,updated_at`,
      { headers: this.headers }
    );
    if (!res.ok) throw new Error(`load failed: HTTP ${res.status}`);
    const rows = (await res.json()) as Array<{
      role_id: string;
      pinned: boolean;
      status: RoleMark["status"];
      note: string | null;
      by: string | null;
      updated_at: string;
    }>;
    const marks: Marks = {};
    for (const r of rows) {
      marks[r.role_id] = {
        pinned: r.pinned,
        status: r.status ?? "new",
        note: r.note ?? "",
        by: r.by ?? "",
        updatedAt: r.updated_at,
      };
    }
    return marks;
  }

  async save(roleId: string, mark: RoleMark): Promise<void> {
    const res = await fetch(`${this.endpoint}?on_conflict=board_id,role_id`, {
      method: "POST",
      headers: { ...this.headers, prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        board_id: this.boardId,
        role_id: roleId,
        pinned: mark.pinned,
        status: mark.status,
        note: mark.note,
        by: mark.by,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`save failed: HTTP ${res.status}`);
  }
}

/**
 * Picks a backend from the runtime config. Falls back to local storage rather
 * than failing, so a bad key degrades the board to per-device marks instead of
 * breaking it.
 */
export function createBackend(config: RemoteConfig | null): SharedStateBackend {
  if (config?.supabaseUrl && config?.supabaseAnonKey) {
    return new SupabaseBackend(
      config.supabaseUrl,
      config.supabaseAnonKey,
      config.boardId ?? "default"
    );
  }
  return new LocalBackend();
}

export { EMPTY_MARK };
