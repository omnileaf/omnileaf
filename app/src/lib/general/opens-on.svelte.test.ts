import { expect, test } from "vitest";

import { resolve } from "$app/paths";

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

const SETTINGS_PAGE = resolve("/(app)/settings/appearance");
const LAST_BOOK_PAGE = resolve("/read/[book]", { book: "7" });
const LIBRARY_PAGE = resolve("/(app)");

function lastBook() {
  return Promise.resolve(LAST_BOOK_PAGE);
}

test("opens on the page Android rebuilt the screen on over the chosen place", async () => {
  const opening = await openingPageOnce(lastBook)("history", SETTINGS_PAGE);

  expect(opening).toEqual({ kind: "restores", page: SETTINGS_PAGE });
});

test("stays on the library Android rebuilt the screen on whatever the chosen place", async () => {
  const opening = await openingPageOnce(lastBook)("lastBook", LIBRARY_PAGE);

  expect(opening).toEqual({ kind: "stays" });
});

test("opens on the chosen place when no page was restored", async () => {
  const opening = await openingPageOnce(lastBook)("history", undefined);

  expect(opening).toEqual({ kind: "opensOn", page: "/history" });
});

test("opens on the last book when chosen and no page was restored", async () => {
  const opening = await openingPageOnce(lastBook)("lastBook", undefined);

  expect(opening).toEqual({ kind: "opensOn", page: LAST_BOOK_PAGE });
});

test("stays on the library when the chosen place is the library", async () => {
  const opening = await openingPageOnce(lastBook)("library", undefined);

  expect(opening).toEqual({ kind: "stays" });
});

test("chooses the opening page only once", async () => {
  const openingPage = openingPageOnce(lastBook);

  const openings = [
    await openingPage("history", SETTINGS_PAGE),
    await openingPage("history", SETTINGS_PAGE),
  ];

  expect(openings).toEqual([
    { kind: "restores", page: SETTINGS_PAGE },
    { kind: "stays" },
  ]);
});
