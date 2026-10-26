import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followDisplayModes } from "#lib/page/display-modes.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import RowsHarness from "./RowsHarness.svelte";

interface RowLook {
  readonly platform: Platform;
  readonly oneLine: number;
  readonly twoLines: number;
  readonly title: string;
  readonly subtitle: string;
  readonly start: string;
  readonly end: string;
}

const NATIVE_ROWS: readonly RowLook[] = [
  {
    platform: "ios",
    oneLine: 52,
    twoLines: 72,
    title: "17px",
    subtitle: "15px",
    start: "16px",
    end: "16px",
  },
  {
    platform: "android",
    oneLine: 56,
    twoLines: 72,
    title: "16px",
    subtitle: "14px",
    start: "16px",
    end: "24px",
  },
];

async function renderRows(
  platform: Platform,
  theme: "light" | "dark" = "light",
): Promise<void> {
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await render(RowsHarness);
}

function element(name: string): HTMLElement {
  const found = page.getByLabelText(name).element();
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${name} row`);
  }
  return found;
}

function slot(row: HTMLElement, name: string): CSSStyleDeclaration {
  const found = row.querySelector(
    name === "item-chevron"
      ? '[data-icon="chevron-right"]'
      : `[data-slot="${name}"]`,
  );
  if (found === null) {
    throw new Error(`the row has no ${name}`);
  }
  return getComputedStyle(found);
}

function ruleAbove(row: HTMLElement): CSSStyleDeclaration {
  const item = row.closest("li");
  if (item === null) {
    throw new Error("the row is outside a list");
  }
  return getComputedStyle(item, "::after");
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  followDisplayModes({ contrast: undefined, transparency: undefined });
  document.body.replaceChildren();
});

test.each(NATIVE_ROWS)(
  "sizes $platform's rows $oneLine and $twoLines tall with the platform's type and sides",
  async ({ platform, oneLine, twoLines, title, subtitle, start, end }) => {
    await renderRows(platform);

    const one = element("One line");
    const two = element("Two lines");

    expect(one.getBoundingClientRect().height).toBeCloseTo(oneLine, 0);
    expect(two.getBoundingClientRect().height).toBeCloseTo(twoLines, 0);
    expect(slot(two, "item-title").fontSize).toBe(title);
    expect(slot(two, "item-title").fontWeight).toBe("400");
    expect(slot(two, "item-description").fontSize).toBe(subtitle);
    expect(getComputedStyle(one).paddingInlineStart).toBe(start);
    expect(getComputedStyle(one).paddingInlineEnd).toBe(end);
  },
);

test("draws iOS's hairline between rows from where the text starts", async () => {
  await renderRows("ios");

  const rule = ruleAbove(element("Two lines"));

  expect(rule.insetInlineStart).toBe("16px");
  expect(rule.blockSize).toBe("1px");
  expect(rule.backgroundColor).toBe("rgba(60, 60, 67, 0.12)");
});

test.each([
  { theme: "light", fill: "rgb(209, 209, 214)", muted: "oklch(0.4 0.01 286)" },
  { theme: "dark", fill: "rgb(58, 58, 60)", muted: "oklch(0.74 0.01 286)" },
] as const)(
  "fills iOS's picked row in systemGray4 and darkens its grey words to stay legible in $theme",
  async ({ theme, fill, muted }) => {
    await renderRows("ios", theme);

    const picked = element("Picked row");

    expect(getComputedStyle(picked).backgroundColor).toBe(fill);
    expect(slot(picked, "item-description").color).toBe(muted);
  },
);

test("deepens iOS's picked row a step under Increase Contrast", async () => {
  followDisplayModes({ contrast: "more", transparency: undefined });

  await renderRows("ios");

  expect(getComputedStyle(element("Picked row")).backgroundColor).toBe(
    "rgb(188, 188, 192)",
  );
});

test("draws no dividers and no chevron on Android", async () => {
  await renderRows("android");

  const one = element("One line");

  expect(ruleAbove(element("Two lines")).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
  expect(slot(one, "item-chevron").display).toBe("none");
});

test("keeps today's full-width divider and chevron on Linux", async () => {
  await renderRows("linux");

  const one = element("One line");
  const rule = ruleAbove(element("Two lines"));

  expect(rule.insetInlineStart).toBe("0px");
  expect(rule.blockSize).toBe("1px");
  expect(slot(one, "item-chevron").display).not.toBe("none");
});

test("starts iOS's hairline after a row's icon, where its text starts", async () => {
  await renderRows("ios");

  const rule = ruleAbove(element("Second with icon"));

  expect(rule.insetInlineStart).toBe("58px");
});

test("lines a row's text up at its start when the row is a button", async () => {
  await renderRows("ios");

  const row = page.getByRole("button", { name: "Button row" }).element();

  expect(getComputedStyle(row).textAlign).toBe("start");
  expect(row.getBoundingClientRect().width).toBeCloseTo(
    document.body.getBoundingClientRect().width,
    0,
  );
});
