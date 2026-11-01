import { expect, test } from "vitest";

import { foldsBarActionsIntoMore, hasLargeTitle } from "./top-bar";

test.each(["compact", "medium", "expanded"] as const)(
  "sets a large title on an iOS screen at %s width",
  (width) => {
    expect(hasLargeTitle("ios", width)).toBe(true);
  },
);

test("sets a large title on an Android phone only", () => {
  expect(hasLargeTitle("android", "compact")).toBe(true);
  expect(hasLargeTitle("android", "medium")).toBe(false);
});

test.each(["linux", "macos", "windows"] as const)(
  "keeps %s without a large title",
  (platform) => {
    expect(hasLargeTitle(platform, "compact")).toBe(false);
    expect(hasLargeTitle(platform, "expanded")).toBe(false);
  },
);

test("folds the bar's actions into More on iOS", () => {
  expect(foldsBarActionsIntoMore("ios")).toBe(true);
});

test.each(["android", "linux", "macos", "windows"] as const)(
  "keeps %s's bar actions out of More",
  (platform) => {
    expect(foldsBarActionsIntoMore(platform)).toBe(false);
  },
);
