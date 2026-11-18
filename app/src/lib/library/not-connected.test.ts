import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { isNotConnected, marksBooksNotConnected } from "./not-connected";

const NOT_CONNECTED = { isConnected: false };
const CONNECTED = { isConnected: true };

test("treats a series with no folder there as not connected on Android", () => {
  expect(isNotConnected(NOT_CONNECTED, "android")).toBe(true);
});

test("treats a series with a folder there as connected on Android", () => {
  expect(isNotConnected(CONNECTED, "android")).toBe(false);
});

test("treats a series with no folder there as not connected on Linux", () => {
  expect(isNotConnected(NOT_CONNECTED, "linux")).toBe(true);
});

test("treats a series with a folder there as connected on Linux", () => {
  expect(isNotConnected(CONNECTED, "linux")).toBe(false);
});

test("treats a series with no folder there as not connected on Windows", () => {
  expect(isNotConnected(NOT_CONNECTED, "windows")).toBe(true);
});

test("treats a series with a folder there as connected on Windows", () => {
  expect(isNotConnected(CONNECTED, "windows")).toBe(false);
});

test.each(["ios", "macos"] satisfies Platform[])(
  "treats a series with no folder there as not connected on %s",
  (platform) => {
    expect(isNotConnected(NOT_CONNECTED, platform)).toBe(true);
    expect(isNotConnected(CONNECTED, platform)).toBe(false);
  },
);

test("marks books and series pages that aren't connected on Android", () => {
  expect(marksBooksNotConnected("android")).toBe(true);
});

test.each(["ios", "linux", "macos", "windows"] as const)(
  "leaves books and series pages unmarked on %s",
  (platform: Platform) => {
    expect(marksBooksNotConnected(platform)).toBe(false);
  },
);
