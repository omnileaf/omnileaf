import { expect, test } from "vitest";

import { openingPageOnce, OpensOnSetting } from "./opens-on.svelte";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("opens on the library until another place is chosen", () => {
  expect(new OpensOnSetting(memoryStore()).choice).toBe("library");
});

test("remembers where Omnileaf opens", () => {
  const store = memoryStore();

  new OpensOnSetting(store).choose("lastBook");

  expect(new OpensOnSetting(store).choice).toBe("lastBook");
});

test("opens on the library when what was stored isn't a place", () => {
  const store = memoryStore();
  store.setItem("omnileaf.opensOn", "browse");

  expect(new OpensOnSetting(store).choice).toBe("library");
});

const SETTINGS_PAGE = "/settings/appearance";
const LAST_BOOK_PAGE = "/read/7";

function pagesWith(restored: string | undefined) {
  const taken: (string | undefined)[] = [];
  return {
    taken,
    pages: {
      restoredRoute: () => {
        taken.push(restored);
        return Promise.resolve(restored);
      },
      lastBook: () => Promise.resolve(LAST_BOOK_PAGE),
    },
  };
}

test("opens on the page Android rebuilt the screen on over the chosen place", async () => {
  const { pages } = pagesWith(SETTINGS_PAGE);

  const opening = await openingPageOnce(pages)("history");

  expect(opening).toBe(SETTINGS_PAGE);
});

test("stays on the library Android rebuilt the screen on whatever the chosen place", async () => {
  const { pages } = pagesWith("/");

  const opening = await openingPageOnce(pages)("lastBook");

  expect(opening).toBeUndefined();
});

test("opens on the chosen place when no page was restored", async () => {
  const { pages } = pagesWith(undefined);

  const opening = await openingPageOnce(pages)("history");

  expect(opening).toBe("/history");
});

test("opens on the last book when chosen and no page was restored", async () => {
  const { pages } = pagesWith(undefined);

  const opening = await openingPageOnce(pages)("lastBook");

  expect(opening).toBe(LAST_BOOK_PAGE);
});

test("chooses the opening page only once, taking the restored page once", async () => {
  const { pages, taken } = pagesWith(SETTINGS_PAGE);
  const openingPage = openingPageOnce(pages);

  const openings = [await openingPage("history"), await openingPage("history")];

  expect(openings).toEqual([SETTINGS_PAGE, undefined]);
  expect(taken).toEqual([SETTINGS_PAGE]);
});
