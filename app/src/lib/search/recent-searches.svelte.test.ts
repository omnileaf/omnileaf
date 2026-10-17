import { expect, test } from "vitest";

import { RecentSearches, searchedWhen } from "./recent-searches.svelte";

const NOON = new Date(2026, 9, 16, 12).getTime();
const DAY_MS = 86_400_000;

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("remembers searches newest first, once each, five at most", () => {
  const store = memoryStore();
  const recent = new RecentSearches(store);

  for (const [index, text] of [
    "one",
    "two",
    "three",
    "Two",
    "four",
    "five",
    "six",
  ].entries()) {
    recent.remember(text, NOON + index);
  }

  expect(new RecentSearches(store).entries.map(({ text }) => text)).toEqual([
    "six",
    "five",
    "four",
    "Two",
    "three",
  ]);
});

test("remembers nothing for a search of only spaces", () => {
  const recent = new RecentSearches(memoryStore());

  recent.remember("   ", NOON);

  expect(recent.entries).toEqual([]);
});

test("forgets every search once cleared", () => {
  const store = memoryStore();
  new RecentSearches(store).remember("harbour gate", NOON);

  new RecentSearches(store).clear();

  expect(new RecentSearches(store).entries).toEqual([]);
});

test("reads what wasn't a list of searches as none", () => {
  const store = memoryStore();
  store.setItem("omnileaf.recentSearches", "{not json");

  expect(new RecentSearches(store).entries).toEqual([]);
});

test("says when each search was made, from today back to a date", () => {
  const when = [0, 1, 3, 9, 30].map((daysAgo) =>
    searchedWhen(NOON - daysAgo * DAY_MS, NOON, "en-GB"),
  );

  expect(when).toEqual([
    "Today",
    "Yesterday",
    "Tuesday",
    "Last week",
    "16 Sept 2026",
  ]);
});
