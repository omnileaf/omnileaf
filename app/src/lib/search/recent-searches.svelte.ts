import { m } from "#lib/paraglide/messages.js";
import {
  type PreferenceStore,
  StoredPreference,
} from "#lib/preferences/stored-preference.ts";

const PREFERENCE_KEY = "omnileaf.recentSearches";
const MOST_REMEMBERED = 5;
const DAY_MS = 86_400_000;
const DAYS_IN_A_WEEK = 7;
const DAYS_IN_TWO_WEEKS = 14;

export interface RecentSearch {
  readonly text: string;
  readonly atMs: number;
}

function isRecentSearch(value: unknown): value is RecentSearch {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string" &&
    "atMs" in value &&
    typeof value.atMs === "number"
  );
}

function storedSearches(stored: string | null): RecentSearch[] {
  try {
    const read: unknown = JSON.parse(stored ?? "[]");
    return Array.isArray(read) ? read.filter(isRecentSearch) : [];
  } catch {
    return [];
  }
}

/** The searches made last on this device, newest first, so they can be run again. */
export class RecentSearches {
  entries: readonly RecentSearch[] = $state([]);

  readonly #stored: StoredPreference;

  constructor(store: PreferenceStore | undefined) {
    this.#stored = new StoredPreference(store, PREFERENCE_KEY);
    this.entries = storedSearches(this.#stored.read());
  }

  remember(text: string, atMs: number): void {
    const searched = text.trim();
    if (searched === "") {
      return;
    }
    const folded = searched.toLocaleLowerCase();
    this.#keep([
      { text: searched, atMs },
      ...this.entries.filter(
        (entry) => entry.text.toLocaleLowerCase() !== folded,
      ),
    ]);
  }

  clear(): void {
    this.#keep([]);
  }

  #keep(entries: readonly RecentSearch[]): void {
    this.entries = entries.slice(0, MOST_REMEMBERED);
    this.#stored.writeIfPossible(JSON.stringify(this.entries));
  }
}

function startOfDay(atMs: number): number {
  const at = new Date(atMs);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

export function searchedWhen(
  atMs: number,
  nowMs: number,
  locale: string,
): string {
  const daysAgo = Math.round((startOfDay(nowMs) - startOfDay(atMs)) / DAY_MS);
  if (daysAgo <= 0) {
    return m.search_recent_today();
  }
  if (daysAgo === 1) {
    return m.search_recent_yesterday();
  }
  if (daysAgo < DAYS_IN_A_WEEK) {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(atMs);
  }
  if (daysAgo < DAYS_IN_TWO_WEEKS) {
    return m.search_recent_last_week();
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(atMs);
}
