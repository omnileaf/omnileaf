import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import ReaderHudHarness from "./ReaderHudHarness.svelte";

const PHONE = { width: 400, height: 800 };
const STRIP_HEIGHT = 64;
const STRIP_COLUMNS = 3;
const PILL = { width: 56, height: 32 };
const PANEL_SIDE_PADDING = 16;
const STRIP_OVERHANG = 8;

async function openHud(
  platform: Platform,
  options: {
    isTwoUp?: boolean;
    isLit?: boolean;
    canPlay?: boolean;
    hidesSlider?: boolean;
  } = {},
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
  await render(ReaderHudHarness, { platform, ...options });
}

function strip(): HTMLElement {
  const element = page.getByRole("group", { name: "Quick settings" }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the reader drew no quick settings");
  }
  return element;
}

function items(): HTMLElement[] {
  return [...strip().querySelectorAll("button")].filter(
    (item): item is HTMLButtonElement =>
      item instanceof HTMLButtonElement && item.offsetParent !== null,
  );
}

function pillOf(item: HTMLElement): HTMLElement {
  const icon = item.querySelector("[data-icon]");
  const pill = icon?.parentElement;
  if (!(pill instanceof HTMLElement) || pill === item) {
    throw new Error("the quick setting drew no icon pill");
  }
  return pill;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("lays Android's quick settings out as a 64 tall strip of three equal columns", async () => {
  await openHud("android");

  const box = strip().getBoundingClientRect();
  const columns = items().map((item) => item.getBoundingClientRect());

  expect(box.height).toBeCloseTo(STRIP_HEIGHT, 0);
  expect(box.width).toBeCloseTo(
    PHONE.width - 2 * PANEL_SIDE_PADDING + 2 * STRIP_OVERHANG,
    0,
  );
  expect(columns).toHaveLength(STRIP_COLUMNS);
  for (const column of columns) {
    expect(column.width).toBeCloseTo(box.width / STRIP_COLUMNS, 0);
  }
});

test("draws each Android quick setting as a 56 by 32 pill over a muted label with no border", async () => {
  await openHud("android");

  for (const item of items()) {
    const pill = pillOf(item).getBoundingClientRect();
    const style = getComputedStyle(item);

    expect([pill.width, pill.height]).toEqual([PILL.width, PILL.height]);
    expect(
      Number.parseFloat(getComputedStyle(pillOf(item)).borderTopLeftRadius),
    ).toBeGreaterThanOrEqual(PILL.height / 2);
    expect(style.borderTopWidth).toBe("0px");
    expect(style.flexDirection).toBe("column");
    expect(style.fontSize).toBe("12px");
    expect(style.letterSpacing).toBe("0.5px");
    expect(style.fontWeight).toBe("500");
  }
});

test("tints a pressed Android quick setting's pill and darkens its label", async () => {
  await openHud("android", { isTwoUp: true });

  const [, twoPages, light] = items();

  expect(
    getComputedStyle(pillOf(twoPages as HTMLElement)).backgroundColor,
  ).toBe(resolvedColour("--native-color-tab-pill", "backgroundColor"));
  expect(getComputedStyle(twoPages as HTMLElement).color).not.toBe(
    getComputedStyle(light as HTMLElement).color,
  );
  expect(getComputedStyle(pillOf(light as HTMLElement)).backgroundColor).toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("groups the quick settings as a centred capsule on iOS phones", async () => {
  await openHud("ios");
  const style = getComputedStyle(strip());

  expect(style.flexWrap).toBe("wrap");
  expect(style.justifyContent).toBe("center");
  expect(Number.parseFloat(style.borderTopLeftRadius)).toBeGreaterThan(0);
});

test("groups the quick settings as a raised wrapping row on the other desktops", async () => {
  await openHud("linux");
  const style = getComputedStyle(strip());

  expect(style.flexWrap).toBe("wrap");
  expect(style.alignItems).toBe("stretch");
  expect(style.boxShadow).not.toBe("none");
});

test("groups the quick settings as a centred row of command buttons on Windows", async () => {
  await openHud("windows");
  const style = getComputedStyle(strip());

  expect(style.flexWrap).toBe("wrap");
  expect(style.justifyContent).toBe("center");
  expect(style.alignItems).toBe("center");
  expect(style.columnGap).toBe("2px");
});

test("keeps the bordered segmented group on the other platforms", async () => {
  await openHud("linux");

  for (const item of items()) {
    expect(getComputedStyle(item).borderTopWidth).toBe("1px");
  }
});

test("keeps the page slider while the strip is not on screen even when auto-scroll is offered", async () => {
  await openHud("android", { canPlay: true, hidesSlider: false });

  await expect.element(page.getByRole("slider")).toBeInTheDocument();
});

test("leaves the page slider to the strip's own scrubber once the strip is on screen", async () => {
  await openHud("android", { canPlay: true, hidesSlider: true });

  expect(page.getByRole("slider").elements()).toHaveLength(0);
});
