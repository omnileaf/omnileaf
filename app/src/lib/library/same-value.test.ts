import { expect, test } from "vitest";

import { isSameValue } from "./same-value";

test("finds two values with the same fields the same whatever their order", () => {
  expect(
    isSameValue(
      { sort: { by: "title", direction: "ascending" }, tags: ["a", "b"] },
      { tags: ["a", "b"], sort: { direction: "ascending", by: "title" } },
    ),
  ).toBe(true);
});

test("finds values that differ in one nested field different", () => {
  expect(
    isSameValue(
      { sort: { by: "title", direction: "ascending" } },
      { sort: { by: "title", direction: "descending" } },
    ),
  ).toBe(false);
});

test("finds lists in a different order different", () => {
  expect(isSameValue(["a", "b"], ["b", "a"])).toBe(false);
});

test("finds a missing field different from one holding nothing", () => {
  expect(isSameValue({ name: null }, {})).toBe(false);
});
