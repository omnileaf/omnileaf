import { expect, test } from "vitest";

import { foregroundBackLook, readerBackLook } from "./reader-bar.ts";

test("inks an Android phone's book screen back arrow in the foreground colour", () => {
  expect(foregroundBackLook("android", "compact").split(" ")).toContain(
    "text-foreground",
  );
});

test("leaves the reader's own back arrow ink alone on an Android phone", () => {
  expect(readerBackLook("android", "compact").split(" ")).not.toContain(
    "text-foreground",
  );
});

test.each([
  ["ios", "compact"],
  ["android", "medium"],
  ["android", "expanded"],
  ["linux", "expanded"],
] as const)(
  "keeps %s at %s width with the reader's back arrow",
  (platform, width) => {
    expect(foregroundBackLook(platform, width)).toBe(
      readerBackLook(platform, width),
    );
  },
);
