import { expect, test } from "vitest";

import { REMEMBERED_PLACES_LIMIT, ScrollMemory } from "./scroll-memory";

const LIBRARY = new URL("https://omnileaf.test/");
const SERIES = new URL("https://omnileaf.test/series/a");
const OLDEST = new URL("https://omnileaf.test/series/oldest");
const LEFT_AT = {
  top: 1200,
  anchor: { href: "/series/a", offset: 300 },
} as const;

test("brings a screen back where it was left when history goes back to it", () => {
  const memory = new ScrollMemory();

  memory.leave(LIBRARY, LEFT_AT);

  expect(memory.placeToRestore("popstate", LIBRARY)).toBe(LEFT_AT);
});

test("opens a screen reached by a link at its top, whatever it was left at", () => {
  const memory = new ScrollMemory();

  memory.leave(LIBRARY, LEFT_AT);

  expect(memory.placeToRestore("link", LIBRARY)).toBeUndefined();
});

test("has nothing to restore for a screen it never left", () => {
  const memory = new ScrollMemory();

  memory.leave(LIBRARY, LEFT_AT);

  expect(memory.placeToRestore("popstate", SERIES)).toBeUndefined();
});

test("hands a place back once, so a later visit to the same page keeps its own", () => {
  const memory = new ScrollMemory();
  memory.leave(LIBRARY, LEFT_AT);

  memory.placeToRestore("popstate", LIBRARY);

  expect(memory.placeToRestore("popstate", LIBRARY)).toBeUndefined();
});

function pageUrl(number: number): URL {
  return new URL(`https://omnileaf.test/page/${String(number)}`);
}

function leavePages(memory: ScrollMemory, count: number): void {
  for (let number = 0; number < count; number += 1) {
    memory.leave(pageUrl(number), LEFT_AT);
  }
}

test("forgets the place left longest ago once it holds more than its limit", () => {
  const memory = new ScrollMemory();
  memory.leave(OLDEST, LEFT_AT);
  leavePages(memory, REMEMBERED_PLACES_LIMIT);

  expect(memory.placeToRestore("popstate", OLDEST)).toBeUndefined();
  expect(memory.placeToRestore("popstate", pageUrl(0))).toBe(LEFT_AT);
});

test("keeps a page left again over pages left before it", () => {
  const memory = new ScrollMemory();
  memory.leave(OLDEST, LEFT_AT);
  leavePages(memory, REMEMBERED_PLACES_LIMIT - 1);
  memory.leave(OLDEST, LEFT_AT);

  memory.leave(pageUrl(REMEMBERED_PLACES_LIMIT), LEFT_AT);

  expect(memory.placeToRestore("popstate", OLDEST)).toBe(LEFT_AT);
  expect(memory.placeToRestore("popstate", pageUrl(0))).toBeUndefined();
});
