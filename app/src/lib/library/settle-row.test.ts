import { expect, test } from "vitest";

import { durationMs } from "./settle-row.ts";

test("reads a duration written in milliseconds", () => {
  expect(durationMs("300ms")).toBe(300);
});

test("reads a duration written in seconds, as a minifier writes it", () => {
  expect(durationMs(".3s")).toBe(300);
  expect(durationMs(" 0.15s")).toBe(150);
});

test("reads a stilled or missing duration as none", () => {
  expect(durationMs("0ms")).toBe(0);
  expect(durationMs("")).toBe(0);
});
