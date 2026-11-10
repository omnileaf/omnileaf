import { expect, test } from "vitest";

import { sectionTabsLook } from "./section-tabs-look";

test("lets an Android phone's tabs span the page, neither wrapping nor held inside it", () => {
  const look = sectionTabsLook("android", "compact");

  expect(look.row).toBe("flex flex-col gap-sm");
  expect(look.list).toBe("");
});

test("heads an Android phone's tabs with the kind's heading and its controls", () => {
  expect(sectionTabsLook("android", "compact").controls).toBe("heading");
});

test.each([
  ["android", "medium"],
  ["android", "expanded"],
  ["linux", "expanded"],
  ["windows", "compact"],
] as const)(
  "keeps %s's tabs hugging their labels at the %s width",
  (platform, width) => {
    const look = sectionTabsLook(platform, width);

    expect(look.row).toBe("flex flex-wrap items-center gap-sm");
    expect(look.list).toBe("flex-wrap max-inline-full");
  },
);

test("puts the search and sort row above an iPhone's tabs", () => {
  const look = sectionTabsLook("ios", "compact");

  expect(look.controls).toBe("choicesFirst");
  expect(look.row).toBe("flex flex-col gap-sm");
});
