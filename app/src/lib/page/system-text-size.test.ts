import { expect, test } from "vitest";

import { textScaleFor } from "./system-text-size";

test("keeps the text at its own size at the default Dynamic Type size", () => {
  expect(textScaleFor(17)).toBe(1);
});

test("grows the text with a larger Dynamic Type size", () => {
  expect(textScaleFor(25.5)).toBe(1.5);
});

test("stops growing the text at twice its size", () => {
  expect(textScaleFor(53)).toBe(2);
});

test("never shrinks the text below its own size", () => {
  expect(textScaleFor(14)).toBe(1);
});

test("keeps the text at its own size when the system size can't be read", () => {
  expect(textScaleFor(Number.NaN)).toBe(1);
});
