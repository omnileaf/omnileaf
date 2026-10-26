import { expect, test } from "vitest";

import { cn } from "#lib/components/cn.ts";

import { ITEM_LOOKS, type ItemLook } from "./looks.ts";

test("keeps every class of every look through the class merge", () => {
  const looks = Object.entries(ITEM_LOOKS);

  const merged = looks.map(([look, classes]) => [look, cn(classes)]);

  expect(merged).toEqual(looks);
});

test.each<[ItemLook, string[]]>([
  ["folder", ["flex", "items-center", "min-block-row"]],
  ["about-phone", ["inline-full", "px-list-row", "min-block-4xl"]],
  ["about-pane", ["inline-full", "px-list-row", "min-block-phone-row"]],
  ["about-version", ["flex-wrap", "ps-list-row", "min-block-4xl"]],
  ["history-phone", ["flex", "gap-md", "desktop:large:hidden"]],
  ["history-desktop", ["hidden", "min-inline-none", "desktop:large:flex"]],
  ["reader-sheet-action", ["gap-md", "px-md", "min-block-touch-target"]],
  [
    "settings-section",
    ["ps-list-row", "hover:bg-hover", "android:min-block-settings-entry"],
  ],
])("lays out the %s row with its own spacing", (look, signature) => {
  const classes = cn(ITEM_LOOKS[look]).split(" ");

  expect(classes).toEqual(expect.arrayContaining(signature));
});

test("lights a row on hover and press only while it is enabled", () => {
  const classes = cn(ITEM_LOOKS.row).split(" ");

  expect(classes).toEqual(
    expect.arrayContaining([
      "not-aria-disabled:hover:bg-hover",
      "not-aria-disabled:active:bg-native-row-selected",
      "not-aria-disabled:active:[--secondary-text:var(--native-color-on-row-selected-muted)]",
    ]),
  );
  expect(classes.filter((found) => /^(hover|active):/.test(found))).toEqual([]);
});

test("lights a reader sheet action on hover only while it is enabled", () => {
  const classes = cn(ITEM_LOOKS["reader-sheet-action"]).split(" ");

  expect(classes).toContain("not-aria-disabled:hover:bg-hover");
  expect(classes).not.toContain("hover:bg-hover");
});
