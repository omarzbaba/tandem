/** Shapes written by scout/harvest.mjs and read by the board. Keep in sync. */

export type Specialty = "vascular" | "radiology";
export type Tier = "strong" | "worth-a-look" | "stretch" | "low";
export type Setting = "academic" | "private" | "hospital-employed" | "government" | "unknown";
export type WorkModel = "remote" | "hybrid" | "onsite";
export type Precision = "city" | "region" | "country" | "remote" | "none";

/** Whose board a row belongs to. Kept generic so the labels live in config. */
export type Partner = "a" | "b";

export interface Geo {
  lat: number | null;
  lon: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  population?: number;
  precision: Precision;
  raw: string;
}

export interface Subscores {
  specialtyFit: number;
  seniority: number;
  practiceQuality: number;
  location: number;
  recency: number;
  signal: number;
}

export interface SourceRef {
  name: string;
  url: string;
  category: string;
}

export interface Role {
  id: string;
  fingerprint: string;
  title: string;
  org: string;
  specialty: Specialty;
  isInterventional: boolean;
  isLeadership: boolean;
  isLocum: boolean;
  setting: Setting;
  workModel: WorkModel;
  locationText: string;
  geo: Geo;
  url: string;
  datePosted: string | null;
  description: string;
  source: SourceRef;
  alsoSeenOn: SourceRef[];
  score: number;
  tier: Tier;
  subscores: Subscores;
  reasons: string[];
  concerns: string[];
  ageDays: number | null;
  isNew?: boolean;
  /** Date this posting first entered the board; never changes afterwards. */
  firstSeen?: string;
  stale?: boolean;
  staleSince?: string;
}

export interface Metro {
  key: string;
  label: string;
  country: string | null;
  region: string | null;
  lat: number;
  lon: number;
  isTogether: boolean;
  vascularIds: string[];
  radiologyIds: string[];
  vascularCount: number;
  radiologyCount: number;
  bestVascularScore: number;
  bestRadiologyScore: number;
  spanMiles: number;
  spanDriveMinutes: number | null;
  sameOrg: boolean;
  approximate: boolean;
  score: number;
  missingSide: Specialty | null;
  /**
   * The surgeon has a post here and the radiologist could take one of the
   * remote posts. Deliberately distinct from `isTogether`, which means both are
   * physically on site.
   */
  remoteUnlocked: boolean;
  remotePartnerCount: number;
  bestRemoteRadiologyScore: number;
}

export interface Pair {
  id: string;
  vascularId: string;
  radiologyId: string;
  miles: number | null;
  driveMinutes: number | null;
  sameOrg: boolean;
  remotePartner: boolean;
  confidence: "pinpoint" | "country-scale" | "approximate" | "remote-partner";
  confidenceNote: string;
  score: number;
}

export interface RunReport {
  ranAt: string;
  today: string;
  radiusMiles: number;
  counts: Record<string, number>;
  failedSources: { name: string; url: string; error: string }[];
  needsCredentials?: { name: string; url: string; needs: string }[];
  emptySources: string[];
  sweepOnlySources: { name: string; url: string; query: string | null }[];
}

export interface BoardData {
  roles: Role[];
  metros: Metro[];
  pairs: Pair[];
  run: RunReport | null;
}

/** Per-row state the couple edits. Shared between them when Supabase is wired. */
export type RoleStatus = "new" | "interested" | "contacted" | "applied" | "passed";

export interface RoleMark {
  pinned: boolean;
  status: RoleStatus;
  note: string;
  /** Who touched it last, so they can tell each other's marks apart. */
  by: string;
  updatedAt: string;
}

export type Marks = Record<string, RoleMark>;

export const EMPTY_MARK: RoleMark = {
  pinned: false,
  status: "new",
  note: "",
  by: "",
  updatedAt: "",
};

export const STATUS_LABELS: Record<RoleStatus, string> = {
  new: "New",
  interested: "Interested",
  contacted: "Contacted",
  applied: "Applied",
  passed: "Passed",
};

export const TIER_LABELS: Record<Tier, string> = {
  strong: "Strong",
  "worth-a-look": "Worth a look",
  stretch: "Stretch",
  low: "Low",
};
