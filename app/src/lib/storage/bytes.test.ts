import { expect, test } from "vitest";

import { formatBytes } from "./bytes";

test("says gigabytes to one decimal place", () => {
  expect([formatBytes(1_440_000_000), formatBytes(128_000_000_000)]).toEqual([
    "1.4 GB",
    "128 GB",
  ]);
});

test("says megabytes in whole numbers below a gigabyte", () => {
  expect(formatBytes(210_000_000)).toBe("210 MB");
});

test("keeps a decimal for less than a megabyte", () => {
  expect(formatBytes(450_000)).toBe("0.5 MB");
});

test("says an empty cache holds 0 MB", () => {
  expect(formatBytes(0)).toBe("0 MB");
});
