import { expect, test } from "vitest";

import { cn } from "#lib/components/cn.ts";

import { categoryTabsLook } from "./category-tabs-look.ts";

const LOOKS = [
  categoryTabsLook("android", "compact"),
  categoryTabsLook("ios", "compact"),
  categoryTabsLook("android", "expanded"),
  categoryTabsLook("linux", "compact"),
];

test("keeps every class of every look through the class merge", () => {
  const classes = LOOKS.flatMap(({ sheet, ...tabs }) => [
    ...Object.values(tabs).filter((value) => typeof value === "string"),
    sheet.header,
    sheet.title,
    sheet.description,
    sheet.list,
    sheet.option,
    sheet.foot,
  ]);

  expect(classes.map((value) => cn(value))).toEqual(classes);
});

test("gives only Android's phone tabs no badge beside the sheet's title and Material icons", () => {
  expect(
    LOOKS.map(({ usesMaterialIcons, sheet }) => [
      usesMaterialIcons,
      sheet.hasBadge,
    ]),
  ).toEqual([
    [true, false],
    [false, true],
    [false, true],
    [false, true],
  ]);
});
