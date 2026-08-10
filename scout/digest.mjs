/**
 * Weekly digest — what changed since last week, as data and as an email.
 *
 * Written by the harvester alongside the board data:
 *   public/data/digest.json  — machine-readable summary of the run's new posts
 *   public/data/digest.html  — a self-contained email body (inline styles
 *                              only: mail clients strip <style> blocks)
 *
 * Every new post links twice: to the original posting, and to the dashboard
 * with a #role= deep link that opens its drawer. The digest deliberately
 * contains NO access code — a forwarded email must never unlock the board.
 */

const HUES = { vascular: "#8c2f3d", radiology: "#3d558c", together: "#6d3d8c" };

/** New-this-run roles, strongest first, capped so the email stays readable. */
export function buildDigest(roles, metros, run, opts) {
  const siteUrl = String(opts?.siteUrl ?? "").replace(/\/+$/, "");
  const today = opts?.today ?? run?.today ?? "";
  const cap = opts?.cap ?? 12;

  const fresh = roles
    .filter((r) => r.isNew)
    .sort((a, b) => b.score - a.score);

  const pick = (specialty) => fresh.filter((r) => r.specialty === specialty).slice(0, cap);
  const vascular = pick("vascular");
  const radiology = pick("radiology");

  const together = (metros ?? []).filter((m) => m.isTogether);

  const entry = (r) => ({
    id: r.id,
    title: r.title,
    org: r.org || null,
    location: r.geo?.city
      ? `${r.geo.city}${r.geo.country === "US" ? `, ${r.geo.region}` : `, ${r.geo.country}`}`
      : r.workModel === "remote"
        ? "Remote"
        : (r.locationText || null),
    specialty: r.specialty,
    score: r.score,
    setting: r.setting,
    postingUrl: r.url,
    boardUrl: `${siteUrl}/#role=${encodeURIComponent(r.id)}`,
  });

  const json = {
    today,
    ranAt: run?.ranAt ?? null,
    siteUrl,
    counts: {
      totalRoles: roles.length,
      newThisRun: fresh.length,
      newVascular: fresh.filter((r) => r.specialty === "vascular").length,
      newRadiology: fresh.filter((r) => r.specialty === "radiology").length,
      togetherMetros: together.length,
      failedSources: run?.counts?.sourcesFailed ?? 0,
    },
    newVascular: vascular.map(entry),
    newRadiology: radiology.map(entry),
    topTogether: together.slice(0, 5).map((m) => ({
      label: m.label,
      score: m.score,
      vascularCount: m.vascularCount,
      radiologyCount: m.radiologyCount,
      sameOrg: m.sameOrg,
    })),
  };

  return { json, html: renderEmail(json) };
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function roleRow(r) {
  const hue = HUES[r.specialty];
  const meta = [r.org, r.location, r.setting === "private" ? "private practice" : null]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  return `
    <tr>
      <td style="padding:10px 14px;border-left:3px solid ${hue};border-bottom:1px solid #eee6dc;">
        <a href="${esc(r.boardUrl)}" style="color:#241f1a;font-weight:600;text-decoration:none;font-size:15px;">${esc(r.title)}</a>
        <div style="color:#7a7166;font-size:12px;margin-top:2px;">${meta || "details on the board"}</div>
        <div style="margin-top:4px;font-size:12px;">
          <a href="${esc(r.boardUrl)}" style="color:${hue};">Open on the board</a>
          &nbsp;·&nbsp;
          <a href="${esc(r.postingUrl)}" style="color:#7a7166;">Original posting</a>
          <span style="color:#b6ac9f;">&nbsp;·&nbsp;fit ${r.score}</span>
        </div>
      </td>
    </tr>`;
}

function section(title, hue, rows) {
  if (!rows.length) return "";
  return `
    <h2 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${hue};margin:26px 0 8px;">${esc(title)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}

function renderEmail(d) {
  const c = d.counts;
  const togetherLine = d.topTogether.length
    ? d.topTogether
        .map((m) => `${esc(m.label)} (${m.vascularCount}v/${m.radiologyCount}r${m.sameOrg ? ", same employer" : ""})`)
        .join(" · ")
    : "none this week";

  const nothingNew = c.newThisRun === 0;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf7f2;">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:Georgia,'Times New Roman',serif;color:#241f1a;">
  <h1 style="font-size:30px;margin:0;font-weight:400;">Tandem</h1>
  <div style="width:52px;height:2px;background:linear-gradient(to right,#8c2f3d,#6d3d8c,#3d558c);margin:6px 0 4px;"></div>
  <p style="font-style:italic;color:#7a7166;margin:0 0 22px;">Weekly digest · ${esc(d.today)}</p>

  <p style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;">
    ${
      nothingNew
        ? `Nothing new this week — the board still holds <strong>${c.totalRoles}</strong> posts and ${c.togetherMetros} areas where you can both work.`
        : `<strong>${c.newThisRun} new post${c.newThisRun === 1 ? "" : "s"}</strong> this week
           (${c.newVascular} vascular surgery, ${c.newRadiology} diagnostic radiology)
           on a board of ${c.totalRoles}. ${c.togetherMetros} areas where you can both work.`
    }
  </p>

  ${section("Vascular surgery — new this week", HUES.vascular, d.newVascular.map(roleRow))}
  ${section("Diagnostic radiology — new this week", HUES.radiology, d.newRadiology.map(roleRow))}

  <h2 style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${HUES.together};margin:26px 0 8px;">Where you can both work</h2>
  <p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#4a443c;">${togetherLine}</p>

  <p style="margin:26px 0 0;">
    <a href="${esc(d.siteUrl)}" style="display:inline-block;background:#241f1a;color:#faf7f2;padding:10px 18px;border-radius:5px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;text-decoration:none;">Open the board</a>
  </p>

  <p style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#b6ac9f;margin-top:26px;line-height:1.5;">
    First time on a new device you'll be asked for your access code — after that it remembers you.<br>
    Made for Dr. Rashad W. Wehbe &amp; Dr. Samia K. Al Sayyid Wehbe · © 2026 Omar Z. Baba, MD
  </p>
</div>
</body></html>`;
}
