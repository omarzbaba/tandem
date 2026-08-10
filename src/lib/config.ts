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
  partnerALabel: string;
  partnerBLabel: string;
  partnerAName: string;
  partnerBName: string;
  defaultRadiusMiles: number;
}

export const FALLBACK_CONFIG: AppConfig = {
  boardTitle: "Tandem",
  boardTagline: "Two careers, one map.",
  partnerALabel: "Vascular surgery",
  partnerBLabel: "Diagnostic radiology",
  partnerAName: "",
  partnerBName: "",
  defaultRadiusMiles: 45,
  sharedBoard: false,
  boardId: "",
};

/**
 * The board id is injected at build time from VITE_BOARD_ID rather than
 * committed, so a public repository gives nothing away. It still reaches the
 * browser in the built bundle — unavoidable for a client-side app with no
 * login — which means the real boundary is who has the site URL. See README.
 */
const BUILD_BOARD_ID = import.meta.env.VITE_BOARD_ID ?? "";

export async function loadConfig(basePath: string): Promise<AppConfig> {
  const injected: Partial<AppConfig> = BUILD_BOARD_ID
    ? { boardId: BUILD_BOARD_ID, sharedBoard: true }
    : {};
  try {
    const res = await fetch(`${basePath}config.json?v=${Date.now()}`);
    if (!res.ok) return { ...FALLBACK_CONFIG, ...injected };
    const fromFile = (await res.json()) as Partial<AppConfig>;
    // The injected id wins: config.json is committed and must stay empty.
    return { ...FALLBACK_CONFIG, ...fromFile, ...injected };
  } catch {
    // A missing or malformed config must not take the board down — the
    // defaults produce a fully working, local-only board.
    return { ...FALLBACK_CONFIG, ...injected };
  }
}
