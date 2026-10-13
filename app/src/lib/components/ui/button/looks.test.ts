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

test.each<[ButtonLook, string[]]>([
  ["text", ["font-semibold", "text-accent"]],
  [
    "quiet",
    ["text-accent", "enabled:hover:bg-hover", "enabled:active:bg-pressed"],
  ],
  ["primary", ["bg-accent", "text-on-accent", "enabled:hover:bg-accent-hover"]],
  ["filled", ["bg-accent", "text-on-accent"]],
  ["outline", ["rounded-control", "border", "border-border", "bg-card"]],
  ["tinted", ["enabled:hover:tint-hover", "enabled:active:tint-pressed"]],
  ["icon", ["flex", "items-center", "justify-center", "rounded-full"]],
  ["header-control", ["rounded-full", "large:rounded-control", "large:border"]],
  [
    "row-action",
    ["rounded-full", "text-muted", "enabled:hover:before:bg-hover"],
  ],
  ["chip", ["rounded-full", "border-border", "hover:bg-hover"]],
  [
    "toolbar-action",
    ["rounded-selection-action", "expanded:bg-selection-action"],
  ],
])("draws the %s look with its colours and shape", (look, signature) => {
  const classes = classesOf(look);

  expect(classes).toEqual(expect.arrayContaining(signature));
});
