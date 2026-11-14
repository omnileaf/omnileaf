import { expect, test } from "vitest";

import { LISTING_CHOICES_KEY, ListingChoices } from "./listing-choices";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a4";
const OTHER_SERIES = "0190a3e4-0000-8000-8000-0000000000a1";

function memoryStore(stored: Record<string, string> = {}) {
  const values = new Map(Object.entries(stored));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("has nothing chosen for a series never sorted or filtered", () => {
  expect(new ListingChoices(memoryStore()).of(SERIES)).toEqual({});
});

test("keeps a series' sort, Show choice and section for the next time it opens", () => {
  const store = memoryStore();

  new ListingChoices(store).keep(SERIES, {
    direction: "ascending",
    shown: "unread",
    section: "chapters",
  });

  expect(new ListingChoices(store).of(SERIES)).toEqual({
    direction: "ascending",
    shown: "unread",
    section: "chapters",
  });
});

test("keeps each series' choices apart", () => {
  const store = memoryStore();
  const choices = new ListingChoices(store);

  choices.keep(SERIES, { direction: "ascending" });
  choices.keep(OTHER_SERIES, { shown: "bookmarked" });

  expect([choices.of(SERIES), choices.of(OTHER_SERIES)]).toEqual([
    { direction: "ascending" },
    { shown: "bookmarked" },
  ]);
});

test("leaves out what it can't read back", () => {
  const store = memoryStore({
    [LISTING_CHOICES_KEY]: JSON.stringify({
      [SERIES]: { direction: "sideways", shown: "unread", section: 3 },
    }),
  });

  expect(new ListingChoices(store).of(SERIES)).toEqual({ shown: "unread" });
});

test("starts afresh from stored text that isn't a set of choices", () => {
  const store = memoryStore({ [LISTING_CHOICES_KEY]: "not json" });

  expect(new ListingChoices(store).of(SERIES)).toEqual({});
});

test("keeps nothing and reads nothing where the web view refuses storage", () => {
  const choices = new ListingChoices(undefined);

  choices.keep(SERIES, { direction: "ascending" });

  expect(choices.of(SERIES)).toEqual({});
});
