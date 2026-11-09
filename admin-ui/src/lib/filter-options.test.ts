import { expect, test } from "vitest";

import { filterOptions } from "#lib/filter-options.ts";
import { aListed } from "#lib/testing.ts";

const REPORTS = [
  aListed({ platform: "macos", version: "1.9.0" }),
  aListed({ platform: "android", version: "1.10.0" }),
  aListed({ platform: "macos", version: "1.10.0-beta.1" }),
  aListed({ platform: "ios", version: "1.10.0" }),
];

test("offers each platform once in alphabetical order", () => {
  expect(filterOptions(REPORTS, {}).platforms).toEqual([
    "android",
    "ios",
    "macos",
  ]);
});

test("offers each version once with the newest first", () => {
  expect(filterOptions(REPORTS, {}).versions).toEqual([
    "1.10.0",
    "1.10.0-beta.1",
    "1.9.0",
  ]);
});

test("offers nothing without reports", () => {
  expect(filterOptions([], {})).toEqual({ platforms: [], versions: [] });
});

test("keeps a selected platform and version the reports no longer have", () => {
  const options = filterOptions(REPORTS, {
    platform: "windows",
    version: "0.9.0",
  });

  expect(options.platforms).toEqual(["android", "ios", "macos", "windows"]);
  expect(options.versions).toEqual([
    "1.10.0",
    "1.10.0-beta.1",
    "1.9.0",
    "0.9.0",
  ]);
});
