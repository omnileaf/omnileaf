import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import { isNotConnected } from "./not-connected";

const NOT_CONNECTED = { isConnected: false };
const CONNECTED = { isConnected: true };

test("treats a series with no folder there as not connected on Android", () => {
  expect(isNotConnected(NOT_CONNECTED, "android")).toBe(true);
});

test("treats a series with a folder there as connected on Android", () => {
  expect(isNotConnected(CONNECTED, "android")).toBe(false);
});

test.each(["ios", "linux", "macos", "windows"] satisfies Platform[])(
  "leaves a not connected series as it was on %s",
  (platform) => {
    expect(isNotConnected(NOT_CONNECTED, platform)).toBe(false);
  },
);
