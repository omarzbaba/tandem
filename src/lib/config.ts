import type { RemoteConfig } from "./shared-state";

/**
 * Runtime configuration, fetched rather than compiled in.
 *
 * Keeping it out of the bundle means the Supabase keys and the couple's own
 * labels can be changed by editing one JSON file in the repo — no rebuild, and
 * nothing personal is baked into a committed JavaScript chunk.
 */
export interface AppConfig extends RemoteConfig {
  boardTitle: string;
  boardTagline: string;
  boardByline: string;
  partnerALabel: string;
  partnerBLabel: string;
  partnerAName: string;
  partnerBName: string;
  defaultRadiusMiles: number;
}

export const FALLBACK_CONFIG: AppConfig = {
  boardTitle: "Bespoke Job Navigator for the Wehbes",
  boardTagline: "Two careers, one map.",
  boardByline: "by OZB",
  partnerALabel: "Vascular surgery",
  partnerBLabel: "Diagnostic radiology",
  partnerAName: "",
  partnerBName: "",
  defaultRadiusMiles: 45,
  sharedBoard: false,
  boardId: "",
};

/**
 * No credential lives here or anywhere in the bundle. The access code is typed
 * once at the gate, verified by /api/marks against a server-held BOARD_ID,
 * and kept in that device's localStorage.
 */
export async function loadConfig(basePath: string): Promise<AppConfig> {
  try {
    const res = await fetch(`${basePath}config.json?v=${Date.now()}`);
    if (!res.ok) return FALLBACK_CONFIG;
    return { ...FALLBACK_CONFIG, ...((await res.json()) as Partial<AppConfig>) };
  } catch {
    // A missing or malformed config must not take the board down.
    return FALLBACK_CONFIG;
  }
}
