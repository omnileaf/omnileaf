import { expect, test } from "vitest";

import { cn } from "#lib/components/cn.ts";

import { BUTTON_LOOKS, type ButtonLook } from "./looks.ts";

function classesOf(look: ButtonLook): string[] {
  return cn(BUTTON_LOOKS[look]).split(" ");
}

test("keeps every class of every look through the class merge", () => {
  const looks = Object.entries(BUTTON_LOOKS);

  const merged = looks.map(([look, classes]) => [look, cn(classes)]);

  expect(merged).toEqual(looks);
});

test("rings every look but the full-width row with the platform's focus ring", () => {
  const looks = Object.keys(BUTTON_LOOKS) as ButtonLook[];

  const ringless = looks.filter(
    (look) => !classesOf(look).includes("focus-visible:focus-ring"),
  );

  expect(ringless).toEqual(["row"]);
});

test.each<[ButtonLook, string[]]>([
  [
    "text",
    [
      "font-medium",
      "text-foreground",
      "android:text-accent",
      "ios:font-semibold",
    ],
  ],
  [
    "quiet",
    ["text-accent", "enabled:hover:bg-hover", "enabled:active:bg-pressed"],
  ],
  ["primary", ["bg-accent", "text-on-accent", "enabled:hover:bg-accent-hover"]],
  ["filled", ["bg-accent", "text-on-accent"]],
  ["outline", ["rounded-control", "border", "border-border", "bg-card"]],
  ["tinted", ["enabled:hover:tint-hover", "enabled:active:tint-pressed"]],
  ["icon", ["flex", "items-center", "justify-center", "rounded-full"]],
  [
    "header-control",
    ["rounded-full", "large:rounded-shadcn-button", "large:border"],
  ],
  [
    "row-action",
    [
      "isolate",
      "rounded-full",
      "text-foreground",
      "before:z-behind",
      "enabled:hover:before:bg-hover",
    ],
  ],
  ["chip", ["rounded-full", "border-border", "hover:bg-hover"]],
  ["row", ["flex", "text-start", "hover:bg-hover", "active:bg-pressed"]],
  ["inverse", ["rounded-full", "bg-accent", "text-on-accent"]],
  [
    "dismiss",
    [
      "isolate",
      "rounded-full",
      "opacity-70",
      "before:z-behind",
      "hover:before:bg-hover",
    ],
  ],
  [
    "bar-icon",
    ["rounded-control", "text-foreground", "enabled:hover:bg-hover"],
  ],
])("draws the %s look with its colours and shape", (look, signature) => {
  const classes = classesOf(look);

  expect(classes).toEqual(expect.arrayContaining(signature));
});
