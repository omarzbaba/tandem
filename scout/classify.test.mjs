import { describe, expect, test } from "vitest";
import { classify, isRelevant } from "./classify.mjs";

const at = (title, extra = {}) => classify({ title, org: "Example Health", ...extra });

describe("classify — specialty from title", () => {
  test.each([
    "Vascular Surgeon",
    "Vascular and Endovascular Surgery Faculty",
    "Endovascular Surgeon — Level I Trauma",
  ])("%s is vascular", (title) => {
    expect(at(title).specialty).toBe("vascular");
  });

  test.each([
    "Diagnostic Radiologist",
    "General Radiology — Partnership Track",
    "Body Imaging Radiologist",
    "Teleradiologist, Night Coverage",
  ])("%s is radiology", (title) => {
    expect(at(title).specialty).toBe("radiology");
  });

  test("an unrelated physician title gets no specialty", () => {
    expect(at("Hospitalist").specialty).toBeNull();
  });
});

describe("classify — rejecting non-attending posts", () => {
  test.each([
    "Vascular Surgery Fellow",
    "Radiology Resident",
    "Vascular Ultrasound Technologist",
    "Radiologic Technologist (RT)",
    "Radiology Scheduling Coordinator",
    "Nurse Practitioner — Vascular Surgery",
    "Vascular Sales Representative",
    "Radiology Systems Engineer",
  ])("%s is not an attending role", (title) => {
    const c = at(title);
    expect(c.isAttending).toBe(false);
    expect(isRelevant(c)).toBe(false);
  });

  test("a department scheduler is rejected even when the body is full of radiology terms", () => {
    const c = classify({
      title: "Scheduling Coordinator",
      department: "Radiology",
      description: "Support our radiologists. The radiologist team reads CT and MR daily.",
      org: "Example Health",
    });
    expect(isRelevant(c)).toBe(false);
  });
});

describe("classify — real misclassifications caught on the live board", () => {
  // Every title here appeared on the production board on 2026-08-10. Each is a
  // job Rashad or Samia cannot take, so each was diluting the board's claim.

  test.each([
    "Medical Assistant II, Vascular Surgery",
    "Medical Assistant II Vascular Surgery",
    "Medical Assistant I Vascular Surgery Center",
    "Medical Assistant - Vascular Surgery",
    "Per Diem Technical Assistant - Diagnostic Radiology (X-Ray)",
  ])("an assistant in a specialty clinic is not a physician: %s", (title) => {
    expect(isRelevant(at(title))).toBe(false);
  });

  test.each([
    "UVA Vascular Medicine Physician",
    "Vascular Medicine - Cardiology",
    "Vascular Medicine Physician - Heart and Vascular Institute",
  ])("vascular medicine is cardiology, not surgery: %s", (title) => {
    // A fellowship-trained vascular surgeon cannot take these posts.
    expect(at(title).specialty).toBeNull();
  });

  test("a cardiothoracic-and-vascular ANESTHESIOLOGIST is not a surgeon", () => {
    expect(at("Physician – Cardiothoracic & Vascular Anesthesiologist – West Michigan").specialty).toBeNull();
  });

  test("an orthopedic title never becomes vascular via its body text", () => {
    const c = classify({
      title: "Orthopedic Spine Surgeon/Neurosurgeon needed in Salisbury, NC!",
      description:
        "Work alongside our vascular surgery and endovascular colleagues in a busy surgical service line.",
      org: "Example Health",
    });
    expect(c.specialty).toBeNull();
  });

  test("cardiothoracic AND VASCULAR SURGERY still counts", () => {
    expect(at("Cardiothoracic and Vascular Surgeon").specialty).toBe("vascular");
  });

  test("a faculty rank is not an assistant job", () => {
    // "Clinical Assistant Professor" is a rank; the surgeon post must survive.
    const c = at("Vascular Surgeon & Clinical Assistant/Associate Professor/Full Professor");
    expect(c.specialty).toBe("vascular");
    expect(isRelevant(c)).toBe(true);
  });

  test("a vascular-surgery title survives a cardiology department name", () => {
    expect(
      at("Vascular Surgery (MD/DO) - UNC Health Southeastern Cardiology and Cardiovascular Care").specialty
    ).toBe("vascular");
  });

  test("pediatric radiology is still radiology", () => {
    expect(at("Pediatric Interventional Radiologist").specialty).toBe("radiology");
    expect(at("Consultant Pediatric Vascular Surgery (SKMC)").specialty).toBe("vascular");
  });

  test("an imaging manager is administration, not a radiologist", () => {
    expect(isRelevant(at("Imaging Manager, Diagnostic Radiology"))).toBe(false);
  });
});

describe("classify — generic titles fall back to the body", () => {
  test("an unambiguous body assigns the specialty", () => {
    const c = classify({
      title: "Consultant Physician",
      description: "The successful candidate will join our diagnostic radiology department.",
      org: "Hamad Medical Corporation",
    });
    expect(c.specialty).toBe("radiology");
  });

  test("a body mentioning both specialties stays unassigned rather than guessing", () => {
    const c = classify({
      title: "Consultant Physician",
      description: "Our vascular surgery and diagnostic radiology teams are both expanding.",
      org: "Example Health",
    });
    expect(c.specialty).toBeNull();
    expect(isRelevant(c)).toBe(false);
  });
});

describe("classify — attributes", () => {
  test("interventional radiology is tagged, not discarded", () => {
    const c = at("Interventional Radiologist");
    expect(c.specialty).toBe("radiology");
    expect(c.isInterventional).toBe(true);
    expect(isRelevant(c)).toBe(true);
  });

  test("leadership is only recognised on a real physician title", () => {
    expect(at("Chief of Vascular Surgery").isLeadership).toBe(true);
    expect(at("Director of Environmental Services").isLeadership).toBe(false);
  });

  test("locum posts are flagged", () => {
    expect(at("Locum Tenens Diagnostic Radiologist").isLocum).toBe(true);
  });

  test("setting is read from the employer and body", () => {
    expect(
      classify({ title: "Vascular Surgeon", org: "University of Example School of Medicine" }).setting
    ).toBe("academic");
    expect(
      classify({ title: "Diagnostic Radiologist", org: "Example Imaging Associates LLC" }).setting
    ).toBe("private");
    expect(
      classify({ title: "Vascular Surgeon", org: "VA Medical Center", description: "Veterans Affairs" })
        .setting
    ).toBe("government");
  });

  test("work model comes from the posting text", () => {
    expect(at("Diagnostic Radiologist", { description: "Fully remote reading from home." }).workModel).toBe(
      "remote"
    );
    expect(at("Diagnostic Radiologist", { description: "Hybrid schedule offered." }).workModel).toBe("hybrid");
    expect(at("Vascular Surgeon").workModel).toBe("onsite");
  });

  test("a location of exactly Remote settles the work model", () => {
    expect(at("Diagnostic Radiologist", { location: "Remote" }).workModel).toBe("remote");
  });

  test.each([
    "Hybrid OR available for complex aortic cases.",
    "Our new hybrid operating room opened last year.",
    "Cases are done in the hybrid suite.",
    "A hybrid theatre supports fenestrated repair.",
  ])("a hybrid operating room is not a hybrid work arrangement: %s", (description) => {
    // Ubiquitous in vascular postings — reading it as a work model would
    // mislabel a large share of the board.
    expect(at("Vascular Surgeon", { description }).workModel).toBe("onsite");
  });

  test("a remote hospital is not a remote job", () => {
    expect(
      at("Diagnostic Radiologist", {
        description: "Serving a remote rural community in the north of the state.",
      }).workModel
    ).toBe("onsite");
  });
});

describe("classify — private practice detection", () => {
  test.each([
    ["Vascular Surgeon", "The Vascular Care Group"],
    ["Diagnostic Radiologist", "Radiology Partners"],
    ["Vascular Surgeon", "Coastal Vein & Vascular Specialists"],
  ])("%s at %s reads as private", (title, org) => {
    expect(classify({ title, org }).setting).toBe("private");
  });

  test("body phrases mark private when the org name does not", () => {
    expect(
      classify({
        title: "Vascular Surgeon",
        org: "Wilmington Health",
        description: "Join our physician-led, independent group with a two-year partnership track.",
      }).setting
    ).toBe("private");
  });

  test("an employed health system stays hospital-employed", () => {
    expect(classify({ title: "Vascular Surgeon", org: "Henry Ford Health" }).setting).toBe("hospital-employed");
  });
});

describe("classify — the employer's name beats its prose", () => {
  test("a private group advertising an academic affiliation stays private", () => {
    // The exact Vascular Care Group failure: body text about teaching and
    // research relabelled a private group's posts as academic.
    expect(
      classify({
        title: "Vascular Surgeon",
        org: "The Vascular Care Group",
        description:
          "Enjoy an academic affiliation with a nearby university and resident teaching opportunities.",
      }).setting
    ).toBe("private");
  });

  test("a university employer stays academic even with partnership words in the body", () => {
    expect(
      classify({
        title: "Assistant Professor, Vascular Surgery",
        org: "University of Example School of Medicine",
        description: "Collaborate with private practice partners across the region.",
      }).setting
    ).toBe("academic");
  });
});
