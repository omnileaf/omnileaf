import { expect, test } from "vitest";

import { coversTrack } from "./section-tile";

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
