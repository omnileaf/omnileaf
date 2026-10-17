import { expect, test } from "vitest";

import { DEFAULT_LOOK, ReaderSettings } from "./reader-settings.svelte";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a1";
const OTHER_SERIES = "0190a3e4-0000-8000-8000-0000000000a2";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("reads every series the same way until told otherwise", () => {
  const settings = new ReaderSettings(memoryStore(), SERIES);

  expect([settings.scope, settings.look]).toEqual(["all", DEFAULT_LOOK]);
});

test("changes every series while the settings apply to all of them", () => {
  const store = memoryStore();
  new ReaderSettings(store, SERIES).change("background", "white");

  const other = new ReaderSettings(store, OTHER_SERIES);

  expect(other.look.background).toBe("white");
});

test("keeps a series' own changes to it once they apply to this series only", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.applyTo("series");
  settings.change("fit", "height");

  const again = new ReaderSettings(store, SERIES);
  const other = new ReaderSettings(store, OTHER_SERIES);

  expect([again.scope, again.look.fit, other.look.fit]).toEqual([
    "series",
    "height",
    "screen",
  ]);
});

test("follows the shared settings again once they apply to all series", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.applyTo("series");
  settings.change("layout", "two");

  settings.applyTo("all");

  expect(settings.look.layout).toBe("automatic");
});

test("reads settings it can't make sense of as the defaults", () => {
  const store = memoryStore();
  store.values.set("omnileaf.readerSettings.all", "{not json");
  store.values.set(
    `omnileaf.readerSettings.series.${SERIES}`,
    JSON.stringify({ fit: "sideways", background: 3 }),
  );
  store.values.set(`omnileaf.readerSettings.scope.${SERIES}`, "series");

  const settings = new ReaderSettings(store, SERIES);

  expect(settings.look).toEqual(DEFAULT_LOOK);
});

test("turns pages at once until slide is chosen, and keeps the choice", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  const first = settings.look.pageTurn;
  settings.change("pageTurn", "slide");

  const again = new ReaderSettings(store, OTHER_SERIES);

  expect([first, again.look.pageTurn]).toEqual(["instant", "slide"]);
});
