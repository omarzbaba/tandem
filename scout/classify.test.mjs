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
