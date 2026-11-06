import { DEFAULT_WCC_INPUT, type WccInput } from "./wcc-types";

const KEY = "salt-atlas.scrape.prefs.v1";

export type ScrapePrefs = {
  options: Omit<WccInput, "startUrls">;
  startUrlsText: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadScrapePrefs(): ScrapePrefs {
  const fallback: ScrapePrefs = {
    options: { ...DEFAULT_WCC_INPUT },
    startUrlsText: "",
  };
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ScrapePrefs>;
    return {
      options: { ...DEFAULT_WCC_INPUT, ...(parsed.options ?? {}) },
      startUrlsText: typeof parsed.startUrlsText === "string" ? parsed.startUrlsText : "",
    };
  } catch {
    return fallback;
  }
}

export function saveScrapePrefs(prefs: ScrapePrefs): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}
