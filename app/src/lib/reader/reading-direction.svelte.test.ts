import { expect, test } from "vitest";

import {
  inReadingOrder,
  SeriesReadingDirection,
} from "./reading-direction.svelte";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a1";
const OTHER_SERIES = "0190a3e4-0000-8000-8000-0000000000a2";
const NOT_WRITTEN = null;

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
  );

  expect([reading.direction, reading.isDetected]).toEqual([
    "rightToLeft",
    true,
  ]);
});

test("reads a series' book that doesn't say the way an earlier book of it did, and only for it", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES, "rightToLeft");

  const readings = [SERIES, OTHER_SERIES].map(
    (series) => new SeriesReadingDirection(store, series, NOT_WRITTEN),
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
  new SeriesReadingDirection(store, SERIES, "rightToLeft");

  const reading = new SeriesReadingDirection(store, SERIES, "leftToRight");

  expect(reading.direction).toBe("leftToRight");
});

test("reads a series the way chosen by hand over the way its book says", () => {
  const reading = new SeriesReadingDirection(
    memoryStore(),
    SERIES,
    "rightToLeft",
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
  );

  reading.choose("rightToLeft");

  expect([reading.choice, reading.direction]).toEqual([
    "rightToLeft",
    "rightToLeft",
  ]);
});

test("remembers the direction chosen for a series, and only for it", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES, NOT_WRITTEN).choose("rightToLeft");

  const choices = [SERIES, OTHER_SERIES].map(
    (series) => new SeriesReadingDirection(store, series, NOT_WRITTEN).choice,
  );

  expect(choices).toEqual(["rightToLeft", "automatic"]);
});

test("leaves a series to the app when what was stored isn't a direction", () => {
  const store = memoryStore();
  store.setItem(`omnileaf.readingDirection.${SERIES}`, "upward");

  const reading = new SeriesReadingDirection(store, SERIES, NOT_WRITTEN);

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
