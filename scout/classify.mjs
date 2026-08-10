/**
 * Turns a raw posting into a typed role: which specialty it belongs to, what
 * kind of practice it is, and whether it is a real attending-level job at all.
 *
 * This is the highest-leverage filter in the pipeline. A national health-system
 * ATS returns thousands of postings — nurses, techs, schedulers, residents —
 * and only a handful are attending vascular surgery or diagnostic radiology
 * jobs. Everything downstream assumes this module has already thrown the rest
 * away, so it errs toward rejecting anything it cannot positively identify.
 */

/** @typedef {"vascular" | "radiology" | null} Specialty */
/** @typedef {"academic" | "private" | "hospital-employed" | "government" | "unknown"} Setting */

const VASCULAR_STRONG = [
  /\bvascular surgeon\b/i,
  /\bvascular surgery\b/i,
  /\bendovascular\b/i,
  /\bvascular (?:and |& )?endovascular\b/i,
  // Must reach a surgery word: "Cardiothoracic & Vascular Anesthesiologist"
  // is an anesthesia post, not a surgical one.
  /\bcardiothoracic (?:and |& )?vascular surg/i,
  // Deliberately absent: "vascular medicine" and "vascular specialist" — that
  // is a cardiology / internal-medicine specialty. A fellowship-trained
  // vascular SURGEON cannot take those posts, and showing them as strong
  // matches quietly pads his side of the board with jobs he cannot have.
];

/**
 * Physician titles that name a DIFFERENT specialty. A posting whose title says
 * what it is ("Orthopedic Spine Surgeon", "Vascular Medicine - Cardiology",
 * "…Anesthesiologist") must never acquire our specialty from a stray keyword
 * in its body text.
 */
const OTHER_SPECIALTY_RE =
  /\b(anesthesiolog|orthopa?edic|neurosurg|podiatr|urolog|plastic surg|cardiolog|vascular medicine|radiation oncolog|dermatolog|ophthalmolog|otolaryngolog|psychiatr|hospitalist|pediatric(?!\s+(?:vascular|radiolog))|obstetric|gynecolog|family (?:medicine|physician)|internal medicine|emergency medicine physician)\b/i;

const RADIOLOGY_STRONG = [
  /\bdiagnostic radiolog(?:y|ist)\b/i,
  /\bradiologist\b/i,
  /\bgeneral radiolog(?:y|ist)\b/i,
  /\bbody imaging\b/i,
  /\bneuroradiolog(?:y|ist)\b/i,
  /\bmusculoskeletal (?:radiolog|imaging)/i,
  /\bbreast imaging\b/i,
  /\bteleradiolog(?:y|ist)\b/i,
  /\bcross[- ]sectional imaging\b/i,
  /\bnuclear medicine physician\b/i,
];

/**
 * Interventional radiology is tagged but demoted, not dropped: the wife is
 * diagnostic/general, so an IR-only posting is a poor fit for her — yet it is
 * still worth showing, because an IR opening is strong evidence that the same
 * department is also hiring or about to hire DR.
 */
const IR_RE = /\binterventional radiolog(?:y|ist)\b|\bIR\/DR\b|\bvascular (?:and |& )?interventional radiolog/i;

/** Titles that contain a specialty word but are not attending physician jobs. */
const NON_ATTENDING = [
  /\b(resident|residency|fellow(?:ship)?|intern|medical student|observer|elective)\b/i,
  /\b(nurse|nursing|\bRN\b|\bLPN\b|\bNP\b|nurse practitioner|physician assistant|\bPA-C\b)\b/i,
  // "Medical Assistant II, Vascular Surgery" is an MA in a vascular clinic —
  // the department name must not make it a surgeon. "Clinical Assistant
  // Professor" stays: the rank word follows immediately.
  /\b(?:medical|technical|surgical|nursing|patient care|physician office|clinic) assistant\b(?!\s*\/?\s*(?:professor|prof\b))/i,
  /\b(?:practice|office|imaging|radiology|clinic|department|operations|business) (?:manager|supervisor)\b/i,
  /\b(technologist|technician|\btech\b|sonographer|ultrasonographer|radiographer|\bRT\b\(?R?\)?)\b/i,
  /\b(scheduler|coordinator|registrar|receptionist|clerk|transcription|biller|coder|coding)\b/i,
  /\b(assistant professor of nursing|research assistant|research coordinator|study coordinator)\b/i,
  /\b(sales|account executive|marketing|recruiter|territory manager|field service)\b/i,
  /\b(engineer|developer|analyst|data scientist|architect)\b/i,
  /\b(volunteer|intern(?:ship)?|per diem tech|housekeep|transport|dietary|security)\b/i,
];

/** Only trusted when the title itself already looks like a physician role. */
const LEADERSHIP_RE =
  /\b(chief|chair(?:man|person)?|director|division head|section head|medical director|program director|vice president|\bVP\b)\b/i;

const ACADEMIC_RE =
  /\b(professor|faculty|academic|university|school of medicine|college of medicine|tenure|research|fellowship program|residency program|\bNIH\b)\b/i;
const PRIVATE_RE =
  /\b(private practice|private group|partnership track|partner track|group practice|\bLLC\b|\bLLP\b|associates|physician[- ]owned|physician[- ]led|independent (?:practice|group)|democratic group|single[- ]specialty group|office[- ]based lab|\bOBL\b|(?:vein|vascular|surgical|radiology|imaging)[\w ]{0,14}(?:group|specialists|partners)\b)/i;
const GOVERNMENT_RE =
  /\b(veterans affairs|\bVA\b medical|veterans health|department of defense|\bDoD\b|army|navy|air force|indian health|public health service|ministry of health)\b/i;

const LOCUM_RE = /\b(locum|locums|temporary|per diem|prn\b|moonlight)\b/i;

/**
 * Work model, matched on phrases rather than bare words.
 *
 * Two traps specific to these specialties:
 *  - "hybrid OR", "hybrid operating room", "hybrid suite" is a piece of theatre
 *    equipment that appears in most vascular postings. It says nothing about
 *    where the surgeon lives.
 *  - a bare "remote" often describes the hospital ("a remote rural community"),
 *    not the job.
 * Both would otherwise mislabel a large share of the board.
 */
const WORK_MODEL = {
  remote:
    /\b(?:fully remote|100% remote|remote (?:position|role|work|opportunity|reading|reads)|work(?:ing)? remotely|work from home|telecommut\w*|teleradiolog\w*|home[- ]based|virtual reads?)\b/i,
  hybrid: /\b(?:hybrid (?:schedule|model|work|arrangement|reading|rota)|partially remote|flexible onsite|mix of (?:on|in)[- ]site)\b/i,
};

/** A location field of exactly "Remote" is authoritative about the work model. */
const LOCATION_IS_REMOTE_RE = /^\s*(?:remote|fully remote|remote[ -]us|anywhere)\s*$/i;

function anyMatch(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/**
 * @param {{title?: string, description?: string, department?: string, org?: string, location?: string}} posting
 * @returns {{
 *   specialty: Specialty,
 *   isInterventional: boolean,
 *   isAttending: boolean,
 *   isLocum: boolean,
 *   isLeadership: boolean,
 *   setting: Setting,
 *   workModel: "remote" | "hybrid" | "onsite",
 *   reasons: string[],
 * }}
 */
export function classify(posting) {
  const title = String(posting?.title ?? "");
  const dept = String(posting?.department ?? "");
  const org = String(posting?.org ?? "");
  const body = String(posting?.description ?? "");

  // The title is authoritative; the body is corroborating evidence only. A
  // radiology department's scheduler posting mentions "radiologist" a dozen
  // times in the body and would otherwise sail through.
  const titleish = `${title} ${dept}`;
  const full = `${title} ${dept} ${body}`;
  const reasons = [];

  const isAttending = !anyMatch(NON_ATTENDING, titleish);
  if (!isAttending) reasons.push("title is not an attending-level physician role");

  let specialty = null;
  const titleNamesOtherSpecialty = OTHER_SPECIALTY_RE.test(titleish);
  if (titleNamesOtherSpecialty && !/\bvascular surg|radiolog/i.test(titleish)) {
    // e.g. "Cardiothoracic & Vascular Anesthesiologist" — leave unassigned.
  } else if (anyMatch(VASCULAR_STRONG, titleish)) {
    specialty = "vascular";
    reasons.push("vascular surgery term in title");
  } else if (anyMatch(RADIOLOGY_STRONG, titleish)) {
    specialty = "radiology";
    reasons.push("radiology term in title");
  } else if (IR_RE.test(titleish)) {
    specialty = "radiology";
    reasons.push("interventional radiology term in title");
  } else if (
    isAttending &&
    /\b(physician|surgeon|md\b|do\b|consultant)\b/i.test(titleish) &&
    // A title that names a different specialty is already answered — an
    // orthopedic surgeon whose ad mentions "vascular" stays orthopedic.
    !OTHER_SPECIALTY_RE.test(titleish)
  ) {
    // Generic physician titles ("Consultant — Department of Radiology") only
    // earn a specialty from the body, and only when the body is unambiguous.
    const vascHit = anyMatch(VASCULAR_STRONG, full);
    const radHit = anyMatch(RADIOLOGY_STRONG, full);
    if (vascHit && !radHit) {
      specialty = "vascular";
      reasons.push("generic physician title, vascular-only body text");
    } else if (radHit && !vascHit) {
      specialty = "radiology";
      reasons.push("generic physician title, radiology-only body text");
    } else if (vascHit && radHit) {
      reasons.push("body mentions both specialties — ambiguous, dropped");
    }
  }

  const isInterventional = IR_RE.test(titleish) || (specialty === "radiology" && IR_RE.test(full));

  // Ordered by strength of evidence. The employer's NAME beats its prose: a
  // private group whose ad boasts an "academic affiliation" is still a private
  // group, and that ordering bug once relabelled every Vascular Care Group
  // post as academic.
  let setting = "unknown";
  if (GOVERNMENT_RE.test(`${org} ${full}`)) setting = "government";
  else if (PRIVATE_RE.test(org)) setting = "private";
  else if (ACADEMIC_RE.test(`${org} ${titleish}`)) setting = "academic";
  else if (PRIVATE_RE.test(full)) setting = "private";
  else if (ACADEMIC_RE.test(body)) setting = "academic";
  else if (org) setting = "hospital-employed";

  const location = String(posting?.location ?? "");
  const workModel =
    LOCATION_IS_REMOTE_RE.test(location) || WORK_MODEL.remote.test(full)
      ? "remote"
      : WORK_MODEL.hybrid.test(full)
        ? "hybrid"
        : "onsite";

  return {
    specialty,
    isInterventional,
    isAttending,
    isLocum: LOCUM_RE.test(titleish),
    isLeadership: isAttending && specialty != null && LEADERSHIP_RE.test(titleish),
    setting,
    workModel,
    reasons,
  };
}

/** A posting is only kept if it is an attending job in one of the two specialties. */
export function isRelevant(classified) {
  return classified.isAttending && classified.specialty != null;
}
