import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import PageSliderHarness from "./PageSliderHarness.svelte";

async function openSlider(
  platform: Platform,
  theme: "light" | "dark" = "light",
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await page.viewport(1280, 800);
  await render(PageSliderHarness, { platform });
}

function part(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the slider drew no ${selector}`);
  }
  return element;
}

function track(): HTMLElement {
  return part("[data-progress-thumb]").previousElementSibling as HTMLElement;
}

function size(element: Element, pseudo?: string): [number, number] {
  const style = getComputedStyle(element, pseudo);
  return [Number.parseFloat(style.width), Number.parseFloat(style.height)];
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws Windows's slider 32 tall on a 4 track with rounded ends", async () => {
  await openSlider("windows");

  expect(size(part("[data-slider-root]"))[1]).toBe(32);
  expect(size(track())[1]).toBe(4);
  expect(
    Number.parseFloat(getComputedStyle(track()).borderTopLeftRadius),
  ).toBeGreaterThanOrEqual(2);
});

test("draws an 18 thumb with a 12 accent centre", async () => {
  await openSlider("windows");
  const thumb = part("[data-progress-thumb]");

  expect(size(thumb)).toEqual([18, 18]);
  expect(size(thumb, "::before")).toEqual([12, 12]);
  expect(getComputedStyle(thumb, "::before").backgroundColor).toBe(
    resolvedColour("--native-color-progress-fill", "backgroundColor"),
  );
});

test("grows the centre to 14 while the pointer is over the slider", async () => {
  await openSlider("windows");

  await userEvent.hover(page.getByRole("slider"));

  expect(size(part("[data-progress-thumb]"), "::before")).toEqual([14, 14]);
});

test("fills the track to the page in the accent over the strong stroke", async () => {
  await openSlider("windows");

  expect(getComputedStyle(track()).backgroundColor).toBe(
    resolvedColour("--native-color-progress-track", "backgroundColor"),
  );
  expect(
    getComputedStyle(track().firstElementChild as Element).backgroundColor,
  ).toBe(resolvedColour("--native-color-progress-fill", "backgroundColor"));
});

test("rings the thumb twice while the slider has the keyboard", async () => {
  await openSlider("windows");

  await userEvent.tab();
  const style = getComputedStyle(part("[data-progress-thumb]"));

  expect(style.outlineStyle).toBe("solid");
  expect(style.outlineColor).toBe(
    resolvedColour("--native-color-focus-ring", "outlineColor"),
  );
  expect(style.boxShadow).toContain(
    resolvedColour("--native-color-focus-ring-inner", "color"),
  );
});

test("keeps the 6 track on the other desktops", async () => {
  await openSlider("linux");

  expect(size(track())[1]).toBe(6);
});
