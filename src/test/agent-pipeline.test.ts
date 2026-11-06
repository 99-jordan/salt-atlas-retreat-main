import { describe, expect, beforeAll, it, vi } from "vitest";
import { checkPage, constrainCrawl, safePublicUrl } from "@/lib/crawl-policy";
import { DEFAULT_WCC_INPUT } from "@/lib/wcc-types";
import type { Resort, PageSection } from "@/lib/types";
import {
  blankFacts, mergeVerifiedResearch, applyWrittenSections, applyEditorPatch, discoveredResorts,
} from "@/lib/agents/agent-client";

beforeAll(() => vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" }));
function resort(): Resort {
  return {
    id: "reef", name: "Reef Guesthouse", country: "Indonesia", region: "Mentawai",
    destination: "Mentawai, Indonesia", stage: "research", officialUrl: "https://reef.example",
    competitors: ["awave"],
    sources: [{ id: "s1", url: "https://reef.example", type: "official", selected: true, scrape: "completed" }],
    facts: blankFacts("reef"),
    exclusivity: { status: "needs_review", evidence: [] },
    researchLog: [],
  };
}
const quote = "Accommodation capacity is limited to 12 guests.";
const page = { url: "https://reef.example/about", markdown: `# About\n\n${quote}` };
function review(value: string, sourceQuote = quote) {
  return {
    facts: [{
      factId: "reef-capacity", value, sourceUrl: page.url,
      sourceQuote, reasoning: "Direct quote from the official About page.",
    }],
    missingFactIds: [],
    additionalSourceUrls: [],
    exclusivity: { status: "clear", reasoning: "No exclusivity language found." },
    readyToDraft: true,
  };
}
describe("Agent evidence and patch gates", () => {
  it("starts extracted fields missing, never invented", () => {
    const r = resort();
    expect(r.facts.length).toBeGreaterThan(10);
    expect(r.facts.every((f) => f.status === "missing" && !f.selected)).toBe(true);
  });
  it("keeps the source quote and treats official evidence as a fact candidate", () => {
    const r = resort();
    const result = mergeVerifiedResearch(r, review("12 guests"), [page]);
    expect(result.applied).toEqual(["reef-capacity"]);
    expect(r.facts.find((f) => f.id === "reef-capacity")?.selected).toBe("12 guests");
    expect(r.facts.find((f) => f.id === "reef-capacity")?.status).toBe("verified");
    expect(r.facts.find((f) => f.id === "reef-capacity")?.candidates[0]?.quote).toBe(quote);
    expect(r.exclusivity.status).toBe("needs_review");
  });
  it("rejects fabricated source quotes rather than filling missing research", () => {
    const r = resort();
    const result = mergeVerifiedResearch(r, review("12 guests", "Resort has unlimited guests"), [page]);
    expect(result.applied).toEqual([]);
    expect(r.facts.find((f) => f.id === "reef-capacity")?.status).toBe("missing");
  });
  it("only lets the Writer update an existing supported section", () => {
    const r = resort();
    mergeVerifiedResearch(r, review("12 guests"), [page]);
    const section: PageSection = {
      id: "accommodation-reef", type: "accommodation", title: "Stay",
      body: "Unverified information", visible: true, items: [], factIds: ["reef-capacity"],
    };
    r.page = {
      sections: [section], versions: [], status: "draft", slug: "reef", title: "Reef", history: [], pendingFactChanges: [],
    };
    const result = applyWrittenSections(r, {
      sections: [
        { sectionId: section.id, title: "Small-group stays", body: "The resort accommodates 12 guests.", usedFactIds: ["reef-capacity"] },
        { sectionId: "not-real", title: "Fake", body: "Fake", usedFactIds: ["reef-capacity"] },
      ],
      warnings: [],
    });
    expect(result).toEqual([section.id]);
    expect(r.page.sections[0]?.title).toBe("Small-group stays");
  });
  it("rejects AI patches targeting a different section", () => {
    const section: PageSection = { id: "hero-reef", type: "hero", title: "Reef", body: "Surf", visible: true, items: [], factIds: [] };
    expect(() => applyEditorPatch(section, { sectionId: "pricing-reef", title: "Oops", body: "Oops" })).toThrow();
  });
  it("retains candidate identity uncertainty and deduplicates URLs", () => {
    const output = discoveredResorts({
      resorts: [{
        name: "Reef Guesthouse", officialUrl: "https://reef.example",
        competitorUrls: [{ url: "https://awave.com.au/reef", competitorId: "awave" }],
        otherSources: ["https://reef.example"],
        identityEvidence: "Only a candidate; ownership not confirmed.",
        needsIdentityReview: true,
      }],
      notes: [],
    }, {
      country: "Indonesia", region: "Mentawai", instruction: "Find resorts",
      competitors: [{ id: "awave", name: "A Wave", domain: "awave.com.au" }],
      knownResortNames: [],
    });
    expect(output).toHaveLength(1);
    expect(output[0]?.sources).toHaveLength(2);
    expect(output[0]?.identityNote).toContain("Identity review required");
  });
});

describe("Deterministic crawler safety policy", () => {
  it("rejects local/private and non-HTTP source URLs", () => {
    expect(safePublicUrl("http://localhost/admin")).toBe(false);
    expect(safePublicUrl("http://127.0.0.1/")).toBe(false);
    expect(safePublicUrl("http://169.254.169.254/latest")).toBe(false);
    expect(safePublicUrl("file:///etc/passwd")).toBe(false);
    expect(safePublicUrl("https://resort.example/surf")).toBe(true);
  });
  it("caps broad crawl settings on the server", () => {
    const input = constrainCrawl({
      ...DEFAULT_WCC_INPUT, startUrls: [{ url: "https://resort.example/" }],
      maxCrawlDepth: 90, maxCrawlPages: 999,
      maxResults: 999, maxConcurrency: 200, initialConcurrency: 80,
      maxRequestRetries: 5, respectRobotsTxtFile: false, useSitemaps: true,
    });
    expect(input.maxCrawlDepth).toBe(3);
    expect(input.maxCrawlPages).toBe(50);
    expect(input.maxConcurrency).toBe(2);
    expect(input.maxRequestRetries).toBe(1);
    expect(input.respectRobotsTxtFile).toBe(true);
    expect(input.useSitemaps).toBe(false);
  });
  it("rejects Cloudflare challenges and 403 errors as source evidence", () => {
    expect(checkPage({ url: "https://resort.example", markdown: "Checking your browser. Cloudflare Ray ID: abc" })).toBe("challenge");
    expect(checkPage({ url: "https://resort.example", crawl: { httpStatusCode: 403 }, text: "Forbidden" })).toBe("http_error");
  });
});
