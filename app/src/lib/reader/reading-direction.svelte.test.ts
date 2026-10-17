import { expect, test } from "vitest";

import {
  inReadingOrder,
  NewSeriesReadingMode,
  SeriesReadingDirection,
} from "./reading-direction.svelte";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a1";
const OTHER_SERIES = "0190a3e4-0000-8000-8000-0000000000a2";
const NOT_WRITTEN = null;
const CAN_T_TELL = null;

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("leaves a series to the app, which reads it left to right when its book doesn't say", () => {
  const reading = new SeriesReadingDirection(
    memoryStore(),
    SERIES,
    NOT_WRITTEN,
    CAN_T_TELL,
  );

  expect([reading.choice, reading.direction, reading.isDetected]).toEqual([
    "automatic",
    "leftToRight",
    false,
  ]);
});

test("reads a series left to the app the way its book says", () => {
  const reading = new SeriesReadingDirection(
    memoryStore(),
    SERIES,
    "rightToLeft",
    CAN_T_TELL,
  );

  expect([reading.direction, reading.isDetected]).toEqual([
    "rightToLeft",
    true,
  ]);
});

test("reads a series' book that doesn't say the way an earlier book of it did, and only for it", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES, "rightToLeft", CAN_T_TELL);

  const readings = [SERIES, OTHER_SERIES].map(
    (series) =>
      new SeriesReadingDirection(store, series, NOT_WRITTEN, CAN_T_TELL),
    CAN_T_TELL,
  );

  expect(
    readings.map((reading) => [reading.direction, reading.isDetected]),
  ).toEqual([
    ["rightToLeft", true],
    ["leftToRight", false],
  ]);
});

test("follows the book over what an earlier book of the series said", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES, "rightToLeft", CAN_T_TELL);

  const reading = new SeriesReadingDirection(
    store,
    SERIES,
    "leftToRight",
    CAN_T_TELL,
  );

  expect(reading.direction).toBe("leftToRight");
});

test("reads a series the way chosen by hand over the way its book says", () => {
  const reading = new SeriesReadingDirection(
    memoryStore(),
    SERIES,
    "rightToLeft",
    CAN_T_TELL,
  );

  reading.choose("leftToRight");

  expect([reading.direction, reading.isDetected]).toEqual([
    "leftToRight",
    false,
  ]);
});

test("reads a series right to left once chosen by hand", () => {
  const reading = new SeriesReadingDirection(
    memoryStore(),
    SERIES,
    NOT_WRITTEN,
    CAN_T_TELL,
  );

  reading.choose("rightToLeft");

  expect([reading.choice, reading.direction]).toEqual([
    "rightToLeft",
    "rightToLeft",
  ]);
});

test("remembers the direction chosen for a series, and only for it", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES, NOT_WRITTEN, CAN_T_TELL).choose(
    "rightToLeft",
  );

  const choices = [SERIES, OTHER_SERIES].map(
    (series) =>
      new SeriesReadingDirection(store, series, NOT_WRITTEN, CAN_T_TELL).choice,
    CAN_T_TELL,
  );

  expect(choices).toEqual(["rightToLeft", "automatic"]);
});

test("leaves a series to the app when what was stored isn't a direction", () => {
  const store = memoryStore();
  store.setItem(`omnileaf.readingDirection.${SERIES}`, "upward");

  const reading = new SeriesReadingDirection(
    store,
    SERIES,
    NOT_WRITTEN,
    CAN_T_TELL,
  );

  expect(reading.choice).toBe("automatic");
});

test("turns the way the book reads, a step to the right going back in a book read right to left", () => {
  const turns = (["leftToRight", "rightToLeft"] as const).flatMap((direction) =>
    (["next", "previous"] as const).map((turn) =>
      inReadingOrder(turn, direction),
    ),
  );

  expect(turns).toEqual(["next", "previous", "previous", "next"]);
});

test("reads a series left to the app as a long strip when its pages look like one", () => {
  const reading = new SeriesReadingDirection(
    memoryStore(),
    SERIES,
    NOT_WRITTEN,
    true,
  );

  expect([reading.mode, reading.isStripDetected]).toEqual(["longStrip", true]);
});

test("pages through a series looking like a long strip once a direction is chosen", () => {
  const reading = new SeriesReadingDirection(
    memoryStore(),
    SERIES,
    NOT_WRITTEN,
    true,
  );

  reading.choose("rightToLeft");

  expect([reading.mode, reading.direction]).toEqual(["paged", "rightToLeft"]);
});

test("reads a series as a long strip once that's chosen, whatever its pages look like", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES, NOT_WRITTEN, false).choose(
    "longStrip",
  );

  const again = new SeriesReadingDirection(store, SERIES, NOT_WRITTEN, false);

  expect([again.choice, again.mode, again.isStripDetected]).toEqual([
    "longStrip",
    "longStrip",
    false,
  ]);
});

test("remembers a series looked like a long strip for a book whose pages can't tell", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES, NOT_WRITTEN, true);

  const later = new SeriesReadingDirection(
    store,
    SERIES,
    NOT_WRITTEN,
    CAN_T_TELL,
  );
  const other = new SeriesReadingDirection(
    store,
    OTHER_SERIES,
    NOT_WRITTEN,
    CAN_T_TELL,
  );

  expect([later.mode, other.mode]).toEqual(["longStrip", "paged"]);
});

test("starts a series with no choice of its own in the reading mode chosen for new series", () => {
  const store = memoryStore();
  new NewSeriesReadingMode(store).choose("longStrip");

  const fresh = new SeriesReadingDirection(store, SERIES, NOT_WRITTEN, false);
  new SeriesReadingDirection(store, OTHER_SERIES, NOT_WRITTEN, false).choose(
    "leftToRight",
  );
  const chosen = new SeriesReadingDirection(
    store,
    OTHER_SERIES,
    NOT_WRITTEN,
    false,
  );

  expect([fresh.mode, chosen.mode]).toEqual(["longStrip", "paged"]);
});

test("leaves new series to the app until a reading mode is chosen for them", () => {
  expect(new NewSeriesReadingMode(memoryStore()).choice).toBe("automatic");
});
