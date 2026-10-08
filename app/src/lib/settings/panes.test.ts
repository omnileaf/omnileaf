import { expect, test } from "vitest";

import type { Platform } from "#lib/ipc/bindings.ts";

import theme from "../../app.css?raw";
import { showsSectionsBeside } from "./panes";

const EVERY_PLATFORM: readonly Platform[] = [
  "android",
  "ios",
  "linux",
  "macos",
  "windows",
];

function variantRule(name: string): string {
  const rule = new RegExp(
    `@custom-variant ${name} (\\{[\\s\\S]*?\\n\\}|[^\\n]+)`,
  ).exec(theme)?.[1];
  if (rule === undefined) {
    throw new Error(`the stylesheet has no ${name} variant`);
  }
  return rule.replace(/\s+/g, " ");
}

function platformsOf(variant: string): ReadonlySet<string> {
  const names = variantRule(variant).matchAll(/data-platform="(\w+)"/g);
  return new Set(
    Array.from(names).flatMap(([, name]) => (name === undefined ? [] : [name])),
  );
}

const DESKTOPS = EVERY_PLATFORM.filter((platform) =>
  platformsOf("desktop").has(platform),
);
const TOUCH = EVERY_PLATFORM.filter((platform) =>
  platformsOf("touch").has(platform),
);

test("shows two panes from the expanded width, or the medium width on a desktop, as the stylesheet does", () => {
  expect(variantRule("two-pane")).toBe(
    "{ @variant expanded { @slot; } @variant desktop { @variant medium { @slot; } } }",
  );
});

test("sorts every platform into desktop or touch exactly once", () => {
  expect([...DESKTOPS, ...TOUCH].toSorted()).toEqual(EVERY_PLATFORM);
});

test.each(EVERY_PLATFORM)(
  "shows the sections beside the open one on %s from the expanded width",
  (platform) => {
    expect(showsSectionsBeside(platform, "expanded")).toBe(true);
  },
);

test.each(DESKTOPS)(
  "shows the sections beside the open one on %s from the medium width",
  (platform) => {
    expect(showsSectionsBeside(platform, "medium")).toBe(true);
  },
);

test.each(TOUCH)(
  "keeps the sections to their own page on a %s tablet at rail width",
  (platform) => {
    expect(showsSectionsBeside(platform, "medium")).toBe(false);
  },
);

test.each(EVERY_PLATFORM)(
  "keeps the sections to their own page on %s at the compact width",
  (platform) => {
    expect(showsSectionsBeside(platform, "compact")).toBe(false);
  },
);
