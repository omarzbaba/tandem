import { useCallback, useEffect, useMemo, useState } from "react";
import { createBackend, getWho, type RemoteConfig, type SharedStateBackend } from "../lib/shared-state";
import { EMPTY_MARK, type Marks, type RoleMark } from "../lib/types";

/**
 * Pins, statuses and notes, with optimistic local updates.
 *
 * A failed remote write rolls the row back and surfaces an error rather than
 * leaving the UI showing a pin that was never saved — on a board two people
 * share, a silently-dropped pin is worse than a visible failure.
 */
export function useMarks(config: RemoteConfig | null) {
  // The config arrives asynchronously, so the backend has to be rebuilt when
  // the board id lands. Pinning it on first render would permanently strand
  // the app on local storage, which looks exactly like a working board right
  // up until the two of them compare pins and find nothing shared.
  const backend: SharedStateBackend = useMemo(
    () => createBackend(config),
    [config?.sharedBoard, config?.boardId]
  );

  const [marks, setMarks] = useState<Marks>({});
  const [syncing, setSyncing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    backend
      .load()
      .then((loaded) => {
        if (!cancelled) setMarks(loaded);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`Could not load shared pins: ${err.message}`);
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  const update = useCallback(
    (roleId: string, patch: Partial<RoleMark>) => {
      const previous = marks[roleId] ?? EMPTY_MARK;
      const next: RoleMark = {
        ...previous,
        ...patch,
        by: getWho() || previous.by,
        updatedAt: new Date().toISOString(),
      };
      setMarks((cur) => ({ ...cur, [roleId]: next }));
      setError(null);

      backend.save(roleId, next).catch((err: Error) => {
        setMarks((cur) => ({ ...cur, [roleId]: previous }));
        setError(`Could not save — ${err.message}`);
      });
    },
    [backend, marks]
  );

  const markFor = useCallback((roleId: string) => marks[roleId] ?? EMPTY_MARK, [marks]);

  const togglePin = useCallback(
    (roleId: string) => update(roleId, { pinned: !(marks[roleId]?.pinned ?? false) }),
    [marks, update]
  );

  return {
    marks,
    markFor,
    update,
    togglePin,
    syncing,
    error,
    backendKind: backend.kind,
    pinnedCount: Object.values(marks).filter((m) => m.pinned).length,
  };
}
