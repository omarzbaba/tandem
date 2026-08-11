/**
 * Tandem weekly digest — Google Apps Script alternative to the GitHub Action
 * email step. Sends the digest from YOUR Gmail account, which for two
 * recipients has the best deliverability there is and needs no app password.
 *
 * SETUP (once, ~3 minutes — same flow as the HF Consulting Forwarder):
 *   1. script.google.com → New project → paste this file over Code.gs.
 *   2. Edit RECIPIENTS below.
 *   3. Run setup() once from the toolbar and grant permissions.
 *      That creates a weekly trigger: Mondays 08:00 (your timezone), safely
 *      after the 06:00 UTC harvest.
 *   4. Optional: run sendDigestNow() to test immediately.
 *
 * It only emails when there is a NEW harvest since the last email (tracked in
 * Script Properties), so a re-run or a failed harvest never double-sends.
 */

const RECIPIENTS = "omar.z.baba@gmail.com"; // ← EDIT: add Rachad and Samia, comma-separated
const SITE = "https://tandem-rs.vercel.app";

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendWeeklyDigest")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  Logger.log("Weekly trigger created: Mondays 08:00 " + Session.getScriptTimeZone());
}

function sendWeeklyDigest() {
  const digest = JSON.parse(UrlFetchApp.fetch(SITE + "/data/digest.json").getContentText());

  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("lastSentRanAt") === digest.ranAt) {
    Logger.log("Already sent for run " + digest.ranAt + " — skipping.");
    return;
  }

  const html = UrlFetchApp.fetch(SITE + "/data/digest.html").getContentText();
  const c = digest.counts;
  const subject =
    c.newThisRun > 0
      ? "Tandem — " + c.newThisRun + " new posting" + (c.newThisRun === 1 ? "" : "s") + " this week"
      : "Tandem — no new postings this week";

  MailApp.sendEmail({ to: RECIPIENTS, subject: subject, htmlBody: html, name: "Tandem" });
  props.setProperty("lastSentRanAt", digest.ranAt);
  Logger.log("Sent to " + RECIPIENTS);
}

/** Manual test: sends regardless of the already-sent check. */
function sendDigestNow() {
  PropertiesService.getScriptProperties().deleteProperty("lastSentRanAt");
  sendWeeklyDigest();
}
