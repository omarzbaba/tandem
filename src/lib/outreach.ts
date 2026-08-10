/**
 * Contact extraction and outreach drafting.
 *
 * Physician postings usually bury a recruiter's email or a department phone
 * number in the body. Surfacing those, and handing over a ready-to-send
 * enquiry, is the difference between a board you read and a board you act on.
 *
 * Entirely client-side — no model call, no server — so it works on a static
 * host and costs nothing to run.
 */

import type { Role } from "./types";
import { formatLocation } from "./format";

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b|\+\d{3}[\s-]?\d{3,4}[\s-]?\d{4}\b/g;

/** Addresses that are never a person to write to. */
const EMAIL_NOISE =
  /(noreply|no-reply|donotreply|webmaster|postmaster|privacy|legal|unsubscribe|support@|example\.|sentry\.|\.png|\.jpg)/i;

export interface Contacts {
  emails: string[];
  phones: string[];
}

export function extractContacts(role: Role): Contacts {
  const text = `${role.description ?? ""}`;
  const emails = [...new Set(text.match(EMAIL_RE) ?? [])]
    .filter((e) => !EMAIL_NOISE.test(e))
    .slice(0, 4);
  const phones = [...new Set((text.match(PHONE_RE) ?? []).map((p) => p.trim()))]
    // Bare 10-digit runs are usually NPI/licence numbers, not phones.
    .filter((p) => /[()\s.+-]/.test(p))
    .slice(0, 3);
  return { emails, phones };
}

export interface OutreachIdentity {
  name: string;
  credentials: string;
  specialty: string;
  currentRole: string;
  partnerLine: string;
}

/**
 * A concise enquiry that leads with the two-body situation. Saying it up front
 * is a feature, not a liability: departments that can solve it self-select, and
 * the ones that cannot save everyone a round of calls.
 */
export function buildOutreachEmail(role: Role, me: OutreachIdentity) {
  const where = formatLocation(role.geo, "your area");
  const subject = `${role.title} — enquiry from a ${me.specialty} attending`;

  const body = [
    `Dear ${role.org} recruitment team,`,
    ``,
    `I am writing about the ${role.title} post in ${where}, which I saw via ${role.source.name}.`,
    ``,
    `I am ${me.name}${me.credentials ? `, ${me.credentials}` : ""}, currently ${me.currentRole}. ${me.partnerLine}`,
    ``,
    `I would welcome a short conversation about the role, the case mix and call structure, and whether the department has scope for both of us in the same area. I am happy to send a CV and references.`,
    ``,
    `With thanks,`,
    me.name,
  ].join("\n");

  return { subject, body };
}

export function mailtoUrl(to: string | undefined, subject: string, body: string): string {
  const params = new URLSearchParams({ subject, body });
  // URLSearchParams encodes spaces as "+", which mail clients render literally.
  return `mailto:${to ?? ""}?${params.toString().replace(/\+/g, "%20")}`;
}

/** Clipboard with a graceful fallback for browsers that block the async API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}
