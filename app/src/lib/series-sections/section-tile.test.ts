import { expect, test } from "vitest";

import { coversGap, coversTrack } from "./section-tile";

test("lays an Android phone's covers out three a row", () => {
  expect(coversTrack("android", "compact")).toBe(
    "grid-template-columns: repeat(3, minmax(0, 1fr))",
  );
});

test.each([
  ["ios", "compact"],
  ["android", "medium"],
  ["linux", "expanded"],
] as const)(
  "fills the row with covers on %s at the %s width",
  (platform, width) => {
    expect(coversTrack(platform, width)).toContain("repeat(auto-fill");
  },
);

test("spaces an Android phone's covers 16px down and 8px across", () => {
  expect(coversGap("android", "compact")).toBe("gap-x-sm gap-y-lg");
});

test.each([
  ["ios", "compact"],
  ["android", "medium"],
  ["linux", "expanded"],
] as const)(
  "spaces covers 20px down and 16px across on %s at the %s width",
  (platform, width) => {
    expect(coversGap(platform, width)).toBe("gap-x-lg gap-y-cover-row");
  },
);
