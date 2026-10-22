import { expect, test } from "vitest";

import { cn } from "#lib/components/cn.ts";

import type { Platform } from "#lib/ipc/bindings.ts";

import { BUTTON_LOOKS, type ButtonLook, buttonClasses } from "./looks.ts";

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

const NATIVE_PLATFORMS: readonly Platform[] = ["android", "ios"];
const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];

test.each(NATIVE_PLATFORMS)(
  "draws a dialog's main button on %s's own button",
  (platform) => {
    const classes = buttonClasses("dialog-primary", platform).split(" ");

    expect(classes).toContain("bg-native-button-primary");
    expect(classes).toContain("min-block-native-button");
  },
);

test.each(DESKTOPS)("keeps today's dialog button on %s", (platform) => {
  const classes = buttonClasses("dialog-primary", platform);

  expect(classes).toBe(BUTTON_LOOKS["dialog-primary"]);
});

test.each(NATIVE_PLATFORMS)(
  "keeps today's look on %s for a button whose size its caller sets",
  (platform) => {
    const classes = buttonClasses("primary", platform);

    expect(classes).toBe(BUTTON_LOOKS.primary);
  },
);

test("rings every native look with the platform's focus ring", () => {
  const nativeLooks = (Object.keys(BUTTON_LOOKS) as ButtonLook[]).filter(
    (look) => buttonClasses(look, "ios") !== BUTTON_LOOKS[look],
  );

  const ringless = nativeLooks.filter(
    (look) => !buttonClasses(look, "ios").includes("focus-visible:focus-ring"),
  );

  expect(nativeLooks).not.toEqual([]);
  expect(ringless).toEqual([]);
});

test.each(NATIVE_PLATFORMS)(
  "keeps today's look on %s for the buttons a sheet lays out",
  (platform) => {
    const classes = buttonClasses("confirm-danger", platform);

    expect(classes).toBe(BUTTON_LOOKS["confirm-danger"]);
  },
);

test.each<[ButtonLook, string]>([
  ["dialog-primary", "primary"],
  ["dialog-secondary", "secondary"],
])("gives the native %s button its own hover and press", (look, variant) => {
  const classes = buttonClasses(look, "android").split(" ");

  expect(classes).toContain(
    `enabled:hover:tint-native-button-${variant}-hover`,
  );
  expect(classes).toContain(
    `enabled:active:tint-native-button-${variant}-pressed`,
  );
});
