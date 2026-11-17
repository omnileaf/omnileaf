import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import AppLockNote from "./AppLockNote.svelte";

const ANDROID_PHONE_WIDTH = 412;
const ANDROID_TABLET_WIDTH = 820;
const SCREEN_HEIGHT = 900;
const ART_SIZE = 80;
const NOTE = /^Omnileaf asks for your fingerprint, face or screen lock/;

function note(): Element {
  return page.getByText(NOTE).element();
}

function art(): SVGSVGElement | null {
  return document.querySelector("svg");
}

function shape(selector: string): Element {
  const found = art()?.querySelector(selector);
  if (found === null || found === undefined) {
    throw new Error(`the lock art has no ${selector}`);
  }
  return found;
}

async function renderOnAndroid(width: number): Promise<void> {
  followCorePlatform("android");
  await page.viewport(width, SCREEN_HEIGHT);
  await render(AppLockNote);
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

for (const theme of ["light", "dark"] as const) {
  test(`draws the lock art 80px square in the accent, hidden from screen readers, on an Android phone in the ${theme} theme`, async () => {
    document.documentElement.dataset.theme = theme;
    await renderOnAndroid(ANDROID_PHONE_WIDTH);

    const lockArt = art();
    const tile = getComputedStyle(shape("rect:nth-of-type(1)"));
    const phone = getComputedStyle(shape("rect:nth-of-type(2)"));
    const shackle = getComputedStyle(shape("path"));
    const body = getComputedStyle(shape("rect:nth-of-type(3)"));
    const accent = resolvedColour("--native-color-button-primary", "color");

    expect(lockArt?.getAttribute("aria-hidden")).toBe("true");
    expect(lockArt?.getBoundingClientRect().width).toBeCloseTo(ART_SIZE, 0);
    expect(lockArt?.getBoundingClientRect().height).toBeCloseTo(ART_SIZE, 0);
    expect(tile.fill).toBe(
      resolvedColour("--native-color-accent-soft", "color"),
    );
    expect(phone.fill).toBe(
      resolvedColour("--android-palette-window", "color"),
    );
    expect(phone.stroke).toBe(accent);
    expect(shackle.fill).toBe("none");
    expect(shackle.stroke).toBe(accent);
    expect(body.fill).toBe(accent);
  });
}

test("sets the note in 14/20 muted type under the art on an Android phone", async () => {
  await renderOnAndroid(ANDROID_PHONE_WIDTH);

  const words = getComputedStyle(note());
  const lockArt = art()?.getBoundingClientRect();

  expect(words.fontSize).toBe("14px");
  expect(words.lineHeight).toBe("20px");
  expect(words.color).toBe(resolvedColour("--color-muted", "color"));
  expect(note().getBoundingClientRect().top).toBeGreaterThan(
    lockArt?.bottom ?? Number.POSITIVE_INFINITY,
  );
});

test("pads the note 16 above, 24 at the sides and 20 below on an Android phone", async () => {
  await renderOnAndroid(ANDROID_PHONE_WIDTH);

  const holder = note().parentElement;
  const padding = holder === null ? null : getComputedStyle(holder);

  expect(padding?.paddingTop).toBe("16px");
  expect(padding?.paddingLeft).toBe("24px");
  expect(padding?.paddingRight).toBe("24px");
  expect(padding?.paddingBottom).toBe("20px");
});

test("shows only the words, with no art, on an Android tablet", async () => {
  await renderOnAndroid(ANDROID_TABLET_WIDTH);

  await expect.element(page.getByText(NOTE)).toBeVisible();
  expect(art()).toBeNull();
});

test("shows only the words, with no art, on the desktop", async () => {
  followCorePlatform("linux");
  await render(AppLockNote);

  await expect.element(page.getByText(NOTE)).toBeVisible();
  expect(art()).toBeNull();
});
