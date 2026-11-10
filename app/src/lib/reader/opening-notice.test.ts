import { expect, test } from "vitest";

import { saysWhereABookOpened } from "./opening-notice";

test("opens a book quietly on Android", () => {
  expect(saysWhereABookOpened("android")).toBe(false);
});

test.each(["ios", "macos", "windows", "linux"] as const)(
  "still says where a book opened on %s",
  (platform) => {
    expect(saysWhereABookOpened(platform)).toBe(true);
  },
);
