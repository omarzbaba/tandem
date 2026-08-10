import { useEffect, useMemo, useState } from "react";
import { buildMetros, buildPairs } from "../../scout/pair.mjs";
import type { BoardData, Metro, Pair, Role, RunReport } from "../lib/types";

/**
 * Loads the committed weekly data.
 *
 * Fetched at runtime rather than bundled, so the GitHub Action that commits a
 * fresh roles.json updates the live board without a rebuild or redeploy.
 */
export function useBoardData(basePath: string) {
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error";
    data: BoardData;
    error: string | null;
  }>({
    status: "loading",
    data: { roles: [], metros: [], pairs: [], run: null },
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const bust = `?v=${Date.now()}`;
        const [rolesRes, metrosRes, runRes] = await Promise.all([
          fetch(`${basePath}data/roles.json${bust}`),
          fetch(`${basePath}data/metros.json${bust}`),
          fetch(`${basePath}data/run.json${bust}`),
        ]);
        if (!rolesRes.ok) throw new Error(`roles.json — HTTP ${rolesRes.status}`);

        const rolesJson = (await rolesRes.json()) as { roles: Role[] };
        const metrosJson = metrosRes.ok
          ? ((await metrosRes.json()) as { metros: Metro[]; pairs: Pair[] })
          : { metros: [], pairs: [] };
        const run = runRes.ok ? ((await runRes.json()) as RunReport) : null;

        if (cancelled) return;
        setState({
          status: "ready",
          data: {
            roles: rolesJson.roles ?? [],
            metros: metrosJson.metros ?? [],
            pairs: metrosJson.pairs ?? [],
            run,
          },
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({ ...s, status: "error", error: (err as Error).message }));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  return state;
}

/**
 * Recomputes clusters when the radius control moves, reusing the harvester's
 * own module. At the committed radius the precomputed data is used as-is, so
 * the common case costs nothing.
 */
export function useRadius(data: BoardData, radiusMiles: number) {
  return useMemo(() => {
    const committed = data.run?.radiusMiles;
    if (committed === radiusMiles || data.roles.length === 0) {
      return { metros: data.metros, pairs: data.pairs };
    }
    return {
      metros: buildMetros(data.roles, { radiusMiles }) as Metro[],
      pairs: buildPairs(data.roles, { radiusMiles }) as Pair[],
    };
  }, [data, radiusMiles]);
}
