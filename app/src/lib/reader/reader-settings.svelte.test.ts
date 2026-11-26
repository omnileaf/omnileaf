import { expect, test } from "vitest";

import {
  DEFAULT_LOOK,
  ReaderDefaults,
  ReaderSettings,
} from "./reader-settings.svelte";

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

test("leaves the volume keys to the volume until turned on", () => {
  const settings = new ReaderSettings(memoryStore(), SERIES);

  expect([
    DEFAULT_LOOK.turnsPagesWithVolumeKeys,
    settings.look.turnsPagesWithVolumeKeys,
  ]).toEqual([false, false]);
});

test("remembers turning pages with the volume keys for every series", () => {
  const store = memoryStore();
  store.values.set(
    "omnileaf.readerSettings.all",
    JSON.stringify({ turnsPagesWithVolumeKeys: true }),
  );

  const settings = new ReaderSettings(store, SERIES);

  expect(settings.look.turnsPagesWithVolumeKeys).toBe(true);
});

test("keeps a series' own volume keys choice over every series'", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.applyTo("series");
  settings.change("turnsPagesWithVolumeKeys", true);

  const again = new ReaderSettings(store, SERIES);
  const other = new ReaderSettings(store, OTHER_SERIES);

  expect([
    again.look.turnsPagesWithVolumeKeys,
    other.look.turnsPagesWithVolumeKeys,
  ]).toEqual([true, false]);
});

test("changes the volume keys for every series from Settings › Reader", () => {
  const store = memoryStore();
  new ReaderDefaults(store).change("turnsPagesWithVolumeKeys", true);

  const settings = new ReaderSettings(store, OTHER_SERIES);

  expect(settings.look.turnsPagesWithVolumeKeys).toBe(true);
});

test("starts the long strip at 3 screens a minute, leaving a stored pages a minute behind", () => {
  const store = memoryStore();
  store.values.set(
    "omnileaf.readerSettings.all",
    JSON.stringify({ pagesPerMinute: 5 }),
  );

  const settings = new ReaderSettings(store, SERIES);

  expect(settings.look.screensPerMinute).toBe(3);
});

test("keeps a whole number of screens a minute from 1 to 12", () => {
  const read = [1, 12, 13, 0, 2.5].map((screensPerMinute) => {
    const store = memoryStore();
    store.values.set(
      "omnileaf.readerSettings.all",
      JSON.stringify({ screensPerMinute }),
    );
    return new ReaderSettings(store, SERIES).look.screensPerMinute;
  });

  expect(read).toEqual([1, 12, 3, 3, 3]);
});

test("keeps a series' own speed over every series' while the look applies to all of them", () => {
  const store = memoryStore();
  new ReaderSettings(store, SERIES).changeSpeed(5);

  const again = new ReaderSettings(store, SERIES);
  const other = new ReaderSettings(store, OTHER_SERIES);

  expect([
    again.scope,
    again.speed,
    again.look.screensPerMinute,
    other.speed,
  ]).toEqual(["all", 5, 5, 3]);
});

test("starts series with no speed of their own at the speed Settings › Reader sets, leaving a series' own", () => {
  const store = memoryStore();
  new ReaderSettings(store, SERIES).changeSpeed(5);

  new ReaderDefaults(store).change("screensPerMinute", 8);

  expect([
    new ReaderSettings(store, SERIES).speed,
    new ReaderSettings(store, OTHER_SERIES).speed,
  ]).toEqual([5, 8]);
});

test("keeps a speed change on a series with no speed of its own to that series", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);

  settings.changeSpeed(4);

  expect([
    new ReaderSettings(store, SERIES).speed,
    new ReaderSettings(store, OTHER_SERIES).speed,
  ]).toEqual([4, 3]);
});

test("saves the speed for every series once All series is chosen", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.changeSpeed(5);
  settings.saveSpeedFor("all");

  settings.changeSpeed(7);

  expect([
    settings.speed,
    new ReaderSettings(store, SERIES).speed,
    new ReaderSettings(store, OTHER_SERIES).speed,
  ]).toEqual([7, 7, 7]);
});

test("drops the series' own speed once All series is chosen", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.changeSpeed(5);

  settings.saveSpeedFor("all");
  new ReaderDefaults(store).change("screensPerMinute", 9);

  expect(new ReaderSettings(store, SERIES).speed).toBe(9);
});

test("keeps the speed it shows for this series once This series is chosen again", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.saveSpeedFor("all");

  settings.saveSpeedFor("series");
  new ReaderDefaults(store).change("screensPerMinute", 9);

  expect(new ReaderSettings(store, SERIES).speed).toBe(3);
});

test("remembers All series for the series it was chosen in", () => {
  const store = memoryStore();
  new ReaderSettings(store, SERIES).saveSpeedFor("all");

  expect([
    new ReaderSettings(store, SERIES).speedSavedFor,
    new ReaderSettings(store, OTHER_SERIES).speedSavedFor,
  ]).toEqual(["all", "series"]);
});

test("leaves a series with no look of its own unsaved when every series' speed changes", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.saveSpeedFor("all");

  settings.changeSpeed(4);

  expect(store.values.has(`omnileaf.readerSettings.series.${SERIES}`)).toBe(
    false,
  );
});

test("goes back to every series' speed with Use the default", () => {
  const store = memoryStore();
  const settings = new ReaderSettings(store, SERIES);
  settings.applyTo("series");
  settings.changeSpeed(8);

  settings.useDefaultSpeed();

  expect([settings.speed, new ReaderSettings(store, SERIES).speed]).toEqual([
    3, 3,
  ]);
});

test("reads a series' stored speed outside 1 to 12 as none", () => {
  const store = memoryStore();
  store.values.set(
    "omnileaf.readerSettings.all",
    JSON.stringify({ screensPerMinute: 5 }),
  );
  store.values.set(
    `omnileaf.readerSettings.series.${SERIES}`,
    JSON.stringify({ screensPerMinute: 13 }),
  );

  const settings = new ReaderSettings(store, SERIES);

  expect(settings.speed).toBe(5);
});

test("offers every series' speed as the default while the series has its own", () => {
  const store = memoryStore();
  new ReaderDefaults(store).change("screensPerMinute", 6);
  const settings = new ReaderSettings(store, SERIES);

  settings.changeSpeed(2);

  expect([settings.speed, settings.defaultSpeed]).toEqual([2, 6]);
});
