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
  ["settings-link", ["px-lg", "hover:bg-hover", "group-first:rounded-ss-card"]],
  ["about-phone", ["inline-full", "px-list-row", "min-block-4xl"]],
  ["about-pane", ["inline-full", "px-list-row", "min-block-phone-row"]],
  ["about-version", ["flex-wrap", "ps-list-row", "min-block-4xl"]],
  ["settings-section", ["ps-list-row", "hover:bg-hover", "desktop:py-none"]],
])("lays out the %s row with its spacing and states", (look, signature) => {
  const classes = cn(ITEM_LOOKS[look]).split(" ");

  expect(classes).toEqual(expect.arrayContaining(signature));
});
