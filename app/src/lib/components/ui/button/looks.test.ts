import { expect, test } from "vitest";

import { cn } from "#lib/components/cn.ts";

import type { Platform } from "#lib/ipc/bindings.ts";

import {
  BUTTON_LOOKS,
  type ButtonLook,
  type ButtonVariant,
  buttonClasses,
  variantClasses,
} from "./looks.ts";

function classesOf(look: ButtonLook): string[] {
  return cn(BUTTON_LOOKS[look]).split(" ");
}

test("keeps every class of every look through the class merge", () => {
  const looks = Object.entries(BUTTON_LOOKS);

  const merged = looks.map(([look, classes]) => [look, cn(classes)]);

  expect(merged).toEqual(looks);
});

const VARIANTS: readonly ButtonVariant[] = [
  "primary",
  "secondary",
  "outline",
  "plain",
  "link",
  "destructive",
];

function enabledOnly(classes: string): string[] {
  return classes.split(" ").filter((name) => name.startsWith("enabled:"));
}

test("tints every desktop look on hover and press when it is drawn on a link", () => {
  const looks = Object.keys(BUTTON_LOOKS) as ButtonLook[];

  const gated = [
    ...looks.flatMap((look) => enabledOnly(buttonClasses(look, "linux"))),
    ...VARIANTS.flatMap((variant) =>
      enabledOnly(variantClasses(variant, "regular", false, "linux")),
    ),
  ];

  expect(gated).toEqual([]);
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
    [
      "text-accent",
      "not-disabled:hover:bg-hover",
      "not-disabled:active:bg-pressed",
    ],
  ],
  [
    "primary",
    ["bg-accent", "text-on-accent", "not-disabled:hover:bg-accent-hover"],
  ],
  ["filled", ["bg-accent", "text-on-accent"]],
  ["outline", ["rounded-control", "border", "border-border", "bg-card"]],
  [
    "tinted",
    ["not-disabled:hover:tint-hover", "not-disabled:active:tint-pressed"],
  ],
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
      "not-disabled:hover:before:bg-hover",
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
    ["rounded-control", "text-foreground", "not-disabled:hover:bg-hover"],
  ],
])("draws the %s look with its colours and shape", (look, signature) => {
  const classes = classesOf(look);

  expect(classes).toEqual(expect.arrayContaining(signature));
});

const NATIVE_PLATFORMS: readonly Platform[] = ["android", "ios"];

test.each(NATIVE_PLATFORMS)(
  "draws a dialog's main button on %s's own button",
  (platform) => {
    const classes = buttonClasses("dialog-primary", platform).split(" ");

    expect(classes).toContain("bg-native-button-primary");
    expect(classes).toContain("min-block-native-button");
  },
);

test.each<Platform>(["linux", "macos"])(
  "keeps today's dialog button on %s",
  (platform) => {
    const classes = buttonClasses("dialog-primary", platform);

    expect(classes).toBe(BUTTON_LOOKS["dialog-primary"]);
  },
);

test.each<[ButtonLook, ButtonVariant]>([
  ["dialog-primary", "primary"],
  ["dialog-secondary", "secondary"],
  ["confirm-danger", "primary"],
  ["confirm-cancel", "secondary"],
])(
  "draws a dialog's %s button on Windows as its %s button",
  (look, variant) => {
    const classes = buttonClasses(look, "windows");

    expect(classes).toBe(variantClasses(variant, "regular", false, "windows"));
  },
);

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
    `not-disabled:not-aria-disabled:hover:tint-native-button-${variant}-hover`,
  );
  expect(classes).toContain(
    `not-disabled:not-aria-disabled:active:tint-native-button-${variant}-pressed`,
  );
});

const MACOS_ONLY = [
  "native-control-fill",
  "native-icon-button-fill",
  "native-on-button-link",
  "native-on-button-plain-pressed",
  "rounded-native-button-small",
  "font-native-button-large",
];

const SHARED_WITH_WINDOWS = new Set(["native-on-button-link"]);

function isMacosOnlyOn(platform: Platform, name: string): boolean {
  return !(platform === "windows" && SHARED_WITH_WINDOWS.has(name));
}

const SIZES = ["small", "regular", "large"] as const;

test("keeps macOS's button utilities out of every other platform's variant buttons", () => {
  const others: readonly Platform[] = ["android", "ios", "linux", "windows"];

  const leaked = others.flatMap((platform) =>
    VARIANTS.flatMap((variant) =>
      SIZES.flatMap((size) =>
        [false, true].flatMap((isIconOnly) => {
          const classes = variantClasses(variant, size, isIconOnly, platform);
          return MACOS_ONLY.filter(
            (name) => classes.includes(name) && isMacosOnlyOn(platform, name),
          );
        }),
      ),
    ),
  );

  expect(leaked).toEqual([]);
});

test("draws Windows's destructive button as its standard button, with nothing red", () => {
  const looks = SIZES.flatMap((size) =>
    [false, true].map((isIconOnly) => ({
      destructive: variantClasses("destructive", size, isIconOnly, "windows"),
      standard: variantClasses("secondary", size, isIconOnly, "windows"),
    })),
  );

  for (const { destructive, standard } of looks) {
    expect(destructive).toBe(standard);
    expect(destructive).not.toMatch(/danger|destructive/);
  }
});

test("presses Windows's hyperlink button into its own pressed text, never the accent fill's colour", () => {
  const classes = variantClasses("link", "regular", false, "windows");

  expect(classes).toContain(
    "not-disabled:not-aria-disabled:active:text-native-on-button-link-pressed",
  );
  expect(classes).not.toContain("text-native-button-primary");
});

test("rings every Windows variant button with the platform's focus ring and its inner line", () => {
  const unringed = VARIANTS.filter((variant) => {
    const classes = variantClasses(variant, "regular", false, "windows");
    return !(
      classes.includes("focus-visible:focus-ring") &&
      classes.includes("focus-visible:ring-native-focus-ring-inner")
    );
  });

  expect(unringed).toEqual([]);
});
