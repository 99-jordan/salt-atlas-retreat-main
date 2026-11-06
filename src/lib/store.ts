import { useSyncExternalStore } from "react";
import type { AppState, Resort } from "./types";
import { seedState } from "./mock-data";
import { newPage } from "./page-gen";

function initial(): AppState {
  const s = seedState();
  const get = (id: string) => s.resorts.find((r) => r.id === id)!;
  const w = get("weligama");
  w.page = newPage(w);
  const t = get("thulus");
  t.page = { ...newPage(t), status: "approved" };
  const a = get("anchor");
  a.page = newPage(a);
  a.page.status = "live";
  a.page.publishedVersion = 1;
  a.page.history = [{ id: "h1", at: "2026-09-14 10:02", action: "Published new page (simulated)", version: 1, url: "https://saltatlas.com/morocco/anchor-bay-surf-house", simulated: true }];
  // Research has since changed the 7-night price -> affected section flagged.
  const price = a.facts.find((f) => f.id === "anchor-price7")!;
  price.candidates.unshift({ id: "c-new", value: "€1,290", sourceUrl: "https://anchor-bay-surf-house.com/packages-2027", sourceType: "official", checkedAt: "2026-11-04" });
  price.selected = "€1,290";
  price.selectedCandidateId = "c-new";
  price.reason = "Resort published 2027 rates on 4 Nov 2026.";
  a.page.pendingFactChanges = ["anchor-price7"];
  for (const r of [w, t, a]) r.page!.versions[0]!.savedAt = "2026-11-03 09:12";
  return s;
}

let state: AppState = initial();
const serverState = state;
const listeners = new Set<() => void>();

export function getState() { return state; }
export function mutate(fn: (draft: AppState) => void) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  listeners.forEach((l) => l());
}
export function mutateResort(id: string, fn: (r: Resort) => void) {
  mutate((s) => {
    const r = s.resorts.find((x) => x.id === id);
    if (r) fn(r);
  });
}
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function useStudio() {
  return useSyncExternalStore(subscribe, getState, () => serverState);
}
export function useResort(id?: string) {
  const s = useStudio();
  return s.resorts.find((r) => r.id === id);
}
