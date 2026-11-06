export type Stage = "discover" | "scrape" | "research" | "generate" | "published";
export type SourceType = "competitor" | "official" | "resort_owned" | "salt_atlas" | "independent";
export type FactStatus = "verified" | "single" | "conflict" | "missing" | "needs_confirmation";
export type ExclusivityStatus = "clear" | "needs_review" | "blocked";
export type ScrapeStatus = "pending" | "queued" | "fetching" | "extracting" | "matching" | "completed" | "failed";
export type PublishStatus = "draft" | "review" | "approved" | "live";

export interface Competitor { id: string; name: string; domain: string }

export interface SourceUrl {
  id: string;
  url: string;
  type: SourceType;
  competitorId?: string;
  selected: boolean;
  scrape: ScrapeStatus;
  error?: string;
  extractedAt?: string;
  fieldsFound?: number;
}

export interface Candidate {
  id: string;
  value: string;
  sourceUrl: string;
  sourceType: SourceType;
  checkedAt: string;
  rejected?: boolean;
  quote?: string;
}

export type Category =
  | "overview" | "surf" | "accommodation" | "pricing" | "food"
  | "destination" | "activities" | "photography" | "faqs" | "contact";

export interface Fact {
  id: string;
  category: Category;
  label: string;
  templateField: string;
  extracted?: string;
  selected?: string;
  selectedCandidateId?: string;
  candidates: Candidate[];
  status: FactStatus;
  reason?: string;
  editorNote?: string;
}

export interface ExclusivityEvidence { note: string; url?: string; sourceType: SourceType }

export interface PageItem { id: string; title: string; body: string; meta?: string; image?: string }
export type SectionType =
  | "hero" | "pricing" | "overview" | "mosaic" | "reasons" | "surf"
  | "accommodation" | "destination" | "food" | "activities" | "faq" | "enquiry";

export interface PageSection {
  id: string;
  type: SectionType;
  visible: boolean;
  eyebrow?: string;
  title: string;
  body: string;
  image?: string;
  cta?: { label: string; href: string };
  items: PageItem[];
  factIds: string[];
}

export interface PageVersion {
  id: string;
  number: number;
  savedAt: string;
  note: string;
  sections: PageSection[];
}

export interface PublishEvent {
  id: string;
  at: string;
  action: string;
  version: number;
  url?: string;
  simulated: true;
}

export interface ResortPage {
  sections: PageSection[];
  versions: PageVersion[];
  publishedVersion?: number;
  status: PublishStatus;
  slug: string;
  title: string;
  history: PublishEvent[];
  pendingFactChanges: string[]; // fact ids changed since last publish
}

export interface Resort {
  id: string;
  name: string;
  country: string;
  region: string;
  destination: string;
  officialUrl?: string;
  competitors: string[];
  stage: Stage;
  knownBefore?: boolean;
  duplicateOf?: string;
  identityNote?: string;
  sources: SourceUrl[];
  facts: Fact[];
  exclusivity: { status: ExclusivityStatus; evidence: ExclusivityEvidence[]; confirmedBy?: string };
  page?: ResortPage;
  researchLog: string[];
}

export interface AppState {
  competitors: Competitor[];
  resorts: Resort[];
  discoveryResults: Resort[]; // pending discovery candidates not yet in the workflow
}
