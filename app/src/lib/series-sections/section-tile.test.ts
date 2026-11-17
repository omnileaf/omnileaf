import { expect, test } from "vitest";

import { coversGrid } from "./section-tile";

test("lays an Android phone's covers out three a row, 16px down and 8px across", () => {
  expect(coversGrid("android", "compact")).toEqual({
    track: "grid-template-columns: repeat(3, minmax(0, 1fr))",
    gap: "gap-x-sm gap-y-lg",
  });
});

test.each([
  ["ios", "compact"],
  ["android", "medium"],
  ["linux", "expanded"],
] as const)(
  "fills the row with covers 20px down and 16px across on %s at the %s width",
  (platform, width) => {
    const grid = coversGrid(platform, width);

    expect([grid.track, grid.gap]).toEqual([
      expect.stringContaining("repeat(auto-fill"),
      "gap-x-lg gap-y-cover-row",
    ]);
  },
);
