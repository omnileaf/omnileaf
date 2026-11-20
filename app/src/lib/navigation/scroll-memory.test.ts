import { expect, test } from "vitest";

import { ScrollMemory } from "./scroll-memory";

const LIBRARY = new URL("https://omnileaf.test/");
const SERIES = new URL("https://omnileaf.test/series/a");
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
