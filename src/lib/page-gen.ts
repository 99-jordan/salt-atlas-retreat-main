import type { Fact, PageSection, Resort, ResortPage } from "./types";
import { IMG } from "./images";
import { slugify } from "./mock-data";

const val = (facts: Fact[], key: string, r: Resort) => facts.find((f) => f.id === `${r.id}-${key}`)?.selected;
const fid = (r: Resort, ...keys: string[]) => keys.map((k) => `${r.id}-${k}`);
let n = 0;
const iid = () => `i${Date.now().toString(36)}${++n}`;

/** Maps the verified research profile onto the (provisional) Salt Atlas resort template. Missing facts render as gaps, never invented. */
export function generateSections(r: Resort): PageSection[] {
  const f = r.facts;
  const v = (k: string) => val(f, k, r) ?? "";
  const gap = (k: string, fallback: string) => v(k) || `[${fallback} — awaiting verification]`;
  const s = (type: PageSection["type"], p: Partial<PageSection>): PageSection => ({
    id: `${type}-${r.id}`, type, visible: true, title: "", body: "", items: [], factIds: [], ...p,
  });
  return [
    s("hero", { eyebrow: r.destination, title: r.name, body: gap("tagline", "Tagline"), image: IMG.wave, cta: { label: "Check availability", href: "#enquire" }, factIds: fid(r, "tagline") }),
    s("pricing", {
      eyebrow: "Packages", title: "Surf packages", body: gap("inclusions", "Inclusions"), factIds: fid(r, "price7", "inclusions"),
      items: [
        { id: iid(), title: "Surf week", meta: gap("price7", "Price"), body: "Confirm pricing basis, seasonal validity and inclusions with the resort." },
        { id: iid(), title: "Custom arrangements", meta: "Enquire", body: "Ask our team for a verified quote." },
      ],
    }),
    s("overview", { eyebrow: "The resort", title: `Why ${r.name.split(" ")[0]}`, body: gap("summary", "Summary"), factIds: fid(r, "summary") }),
    s("mosaic", { title: "In pictures", body: v("photos") ? `Images: ${v("photos")}` : "Photography permissions pending.", items: [IMG.wave, IMG.aerial, IMG.villa, IMG.dining].map((image, i) => ({ id: iid(), title: ["Lineup", "Reef passes", "Bungalows", "Dining deck"][i] ?? "", body: "", image })), factIds: fid(r, "photos") }),
    s("reasons", { title: "Reasons we recommend it", body: "", factIds: fid(r, "break", "capacity", "transfer"), items: [
      { id: iid(), title: "Guest capacity", body: gap("capacity", "capacity") },
      { id: iid(), title: "Primary surf break", body: gap("break", "primary break") },
      { id: iid(), title: "Seamless arrival", body: gap("transfer", "Transfer") },
    ] }),
    s("surf", { eyebrow: "The surf", title: "The waves", body: `Best season: ${gap("season", "season")}. Suited to ${gap("level", "ability level").toLowerCase()} surfers.`, image: IMG.aerial, factIds: fid(r, "break", "waveType", "season", "level"),
      items: [{ id: iid(), title: gap("break", "Primary break"), meta: gap("waveType", "Wave type"), body: "Our surf team's notes on the main break." }] }),
    s("accommodation", { eyebrow: "Stay", title: "Accommodation", body: `Capacity: ${gap("capacity", "capacity")}.`, factIds: fid(r, "rooms", "capacity"),
      items: (v("rooms") || "Room type").split("·").map((t) => ({ id: iid(), title: t.trim(), body: "Room amenities require resort confirmation.", image: IMG.villa })) }),
    s("destination", { eyebrow: "Getting there", title: r.region, body: `Fly into ${gap("airport", "airport")}. ${gap("transfer", "Transfer")}.`, image: IMG.aerial, factIds: fid(r, "airport", "transfer") }),
    s("food", { eyebrow: "Food & wellness", title: "Eat well, recover well", body: gap("meals", "Meals"), image: IMG.dining, factIds: fid(r, "meals", "wellness"),
      items: (v("wellness") ? v("wellness").split("·") : []).map((t) => ({ id: iid(), title: t.trim(), body: "" })) }),
    s("activities", { title: "Beyond the surf", body: "", factIds: fid(r, "activities"), items: (v("activities") || "").split("·").filter(Boolean).map((t) => ({ id: iid(), title: t.trim(), body: "" })) }),
    s("faq", { title: "Questions", body: "", factIds: fid(r, "boards", "airport"), items: [
      { id: iid(), title: "Can I hire boards?", body: gap("boards", "Board hire") },
      { id: iid(), title: "Which airport do I fly into?", body: gap("airport", "Airport") },
    ] }),
    s("enquiry", { eyebrow: "Enquire", title: "Talk to a Salt Atlas surf specialist", body: "We've surfed it. Tell us your dates and we'll come back within one working day.", cta: { label: "Start an enquiry", href: "https://saltatlas.com/enquire" }, factIds: fid(r, "email") }),
  ];
}

export function newPage(r: Resort): ResortPage {
  const sections = generateSections(r);
  return {
    sections, title: `${r.name} | Surf ${r.region} | Salt Atlas`, slug: `${slugify(r.country)}/${slugify(r.name)}`, status: "draft",
    versions: [{ id: "v1", number: 1, savedAt: stamp(), note: "Generated from verified research", sections }],
    history: [], pendingFactChanges: [],
  };
}

export function stamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}
