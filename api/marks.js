/**
 * Shared pins, statuses and notes — the only stateful endpoint in the app.
 *
 *   GET  /api/marks?board=<id>   → every mark on that board
 *   POST /api/marks              → upsert one mark
 *
 * The database credential lives in this function's environment and is never
 * sent to the browser, so the page ships with no key at all. What identifies a
 * board is the `board` id, which behaves as a capability: unguessable, and
 * useless for reaching anything else. The service role is scoped by grant to
 * `tandem_marks` alone, so even a flaw here cannot touch another table.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const STATUSES = new Set(["new", "interested", "contacted", "applied", "passed"]);
const TABLE = "tandem_marks";

const LIMITS = {
  board: { min: 4, max: 64 },
  roleId: 400,
  note: 2000,
  by: 80,
};

function send(res, status, body) {
  res.setHeader("content-type", "application/json");
  // Pins are per-board and short-lived; never let a CDN serve one user's view
  // of the board to the other.
  res.setHeader("cache-control", "no-store");
  res.status(status).send(JSON.stringify(body));
}

/**
 * The one credential the couple holds. When BOARD_ID is set, every request
 * must present exactly that id — a wrong code is 403, and the correct code
 * never appears in the shipped JavaScript. Entering it once per device is the
 * whole sign-in.
 */
function boardAuthorized(candidate) {
  const expected = process.env.BOARD_ID ?? "";
  if (!expected) return true; // unset → open board (local dev)
  if (typeof candidate !== "string" || candidate.length !== expected.length) return false;
  // Constant-time comparison; the code is low-entropy enough to care.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return {
    endpoint: `${url.replace(/\/+$/, "")}/rest/v1/${TABLE}`,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
  };
}

/** Reject anything malformed before it reaches the database. */
function validateMark(body) {
  const board = String(body?.boardId ?? "").trim();
  const roleId = String(body?.roleId ?? "").trim();

  if (board.length < LIMITS.board.min || board.length > LIMITS.board.max) {
    return { error: "boardId must be 8-64 characters" };
  }
  if (!roleId || roleId.length > LIMITS.roleId) {
    return { error: `roleId must be 1-${LIMITS.roleId} characters` };
  }

  const status = String(body?.status ?? "new");
  if (!STATUSES.has(status)) return { error: `status must be one of ${[...STATUSES].join(", ")}` };

  const note = String(body?.note ?? "");
  if (note.length > LIMITS.note) return { error: `note must be under ${LIMITS.note} characters` };

  const by = String(body?.by ?? "");
  if (by.length > LIMITS.by) return { error: `by must be under ${LIMITS.by} characters` };

  return {
    row: {
      board_id: board,
      role_id: roleId,
      pinned: Boolean(body?.pinned),
      status,
      note,
      by,
      updated_at: new Date().toISOString(),
    },
  };
}

export default async function handler(req, res) {
  const cfg = config();
  if (!cfg) {
    return send(res, 503, {
      error: "Shared pins are not configured — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are unset.",
    });
  }

  try {
    if (req.method === "GET") {
      const board = String(req.query?.board ?? "").trim();
      if (board.length < LIMITS.board.min || board.length > LIMITS.board.max) {
        return send(res, 400, { error: "board query parameter is required" });
      }
      if (!boardAuthorized(board)) {
        return send(res, 403, { error: "That access code is not right." });
      }

      const url =
        `${cfg.endpoint}?board_id=eq.${encodeURIComponent(board)}` +
        `&select=role_id,pinned,status,note,by,updated_at`;
      const upstream = await fetch(url, { headers: cfg.headers });
      if (!upstream.ok) {
        return send(res, 502, { error: `store read failed (${upstream.status})` });
      }

      const rows = await upstream.json();
      const marks = {};
      for (const r of rows) {
        marks[r.role_id] = {
          pinned: r.pinned,
          status: r.status ?? "new",
          note: r.note ?? "",
          by: r.by ?? "",
          updatedAt: r.updated_at,
        };
      }
      return send(res, 200, { marks });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {});
      const { row, error } = validateMark(body);
      if (error) return send(res, 400, { error });
      if (!boardAuthorized(row.board_id)) {
        return send(res, 403, { error: "That access code is not right." });
      }

      const upstream = await fetch(`${cfg.endpoint}?on_conflict=board_id,role_id`, {
        method: "POST",
        headers: { ...cfg.headers, prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row),
      });
      if (!upstream.ok) {
        const detail = await upstream.text();
        return send(res, 502, { error: `store write failed (${upstream.status})`, detail: detail.slice(0, 300) });
      }
      return send(res, 200, { ok: true });
    }

    res.setHeader("allow", "GET, POST");
    return send(res, 405, { error: `${req.method} not allowed` });
  } catch (err) {
    return send(res, 500, { error: String(err?.message ?? err) });
  }
}
