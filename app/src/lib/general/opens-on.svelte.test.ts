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

function lastBook() {
  return Promise.resolve(LAST_BOOK_PAGE);
}

test("opens on the page Android rebuilt the screen on over the chosen place", async () => {
  const opening = await openingPageOnce(lastBook)("history", SETTINGS_PAGE);

  expect(opening).toBe(SETTINGS_PAGE);
});

test("stays on the library Android rebuilt the screen on whatever the chosen place", async () => {
  const opening = await openingPageOnce(lastBook)("lastBook", "/");

  expect(opening).toBeUndefined();
});

test("opens on the chosen place when no page was restored", async () => {
  const opening = await openingPageOnce(lastBook)("history", undefined);

  expect(opening).toBe("/history");
});

test("opens on the last book when chosen and no page was restored", async () => {
  const opening = await openingPageOnce(lastBook)("lastBook", undefined);

  expect(opening).toBe(LAST_BOOK_PAGE);
});

test("chooses the opening page only once", async () => {
  const openingPage = openingPageOnce(lastBook);

  const openings = [
    await openingPage("history", SETTINGS_PAGE),
    await openingPage("history", SETTINGS_PAGE),
  ];

  expect(openings).toEqual([SETTINGS_PAGE, undefined]);
});
