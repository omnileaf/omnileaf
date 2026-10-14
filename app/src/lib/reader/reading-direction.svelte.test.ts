import { expect, test } from "vitest";

import {
  inReadingOrder,
  SeriesReadingDirection,
} from "./reading-direction.svelte";

const SERIES = "0190a3e4-0000-8000-8000-0000000000a1";
const OTHER_SERIES = "0190a3e4-0000-8000-8000-0000000000a2";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("leaves a series to the app, which reads it left to right", () => {
  const reading = new SeriesReadingDirection(memoryStore(), SERIES);

  expect([reading.choice, reading.direction]).toEqual([
    "automatic",
    "leftToRight",
  ]);
});

test("reads a series right to left once chosen by hand", () => {
  const reading = new SeriesReadingDirection(memoryStore(), SERIES);

  reading.choose("rightToLeft");

  expect([reading.choice, reading.direction]).toEqual([
    "rightToLeft",
    "rightToLeft",
  ]);
});

test("remembers the direction chosen for a series, and only for it", () => {
  const store = memoryStore();
  new SeriesReadingDirection(store, SERIES).choose("rightToLeft");

  const choices = [SERIES, OTHER_SERIES].map(
    (series) => new SeriesReadingDirection(store, series).choice,
  );

  expect(choices).toEqual(["rightToLeft", "automatic"]);
});

test("leaves a series to the app when what was stored isn't a direction", () => {
  const store = memoryStore();
  store.setItem(`omnileaf.readingDirection.${SERIES}`, "upward");

  const reading = new SeriesReadingDirection(store, SERIES);

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
