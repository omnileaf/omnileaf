import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { contrastOverLayers } from "../../../tests/components/composited-contrast";

import ReaderPanelHarness from "./ReaderPanelHarness.svelte";

const BACKINGS = ["#000000", "#ffffff"] as const;
const LOOKS = [
  {
    name: "dark controls in the light theme",
    theme: "light",
    controls: "dark",
  },
  {
    name: "light controls in the light theme",
    theme: "light",
    controls: "matchApp",
  },
  {
    name: "light controls in the dark theme",
    theme: "dark",
    controls: "matchApp",
  },
] as const;
const TEXT_CONTRAST = 4.5;

async function openPanel(
  platform: Platform,
  theme: "light" | "dark",
  controls: "dark" | "matchApp",
  canPlay = false,
): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = theme;
  await page.viewport(1280, 800);
  await render(ReaderPanelHarness, { platform, controls, canPlay });
  await userEvent.hover(page.getByRole("slider"));
}

function panel(): HTMLElement {
  const element = page.getByRole("slider").element().closest("div.flex-col");
  if (!(element instanceof HTMLElement)) {
    throw new Error("the reader drew no panel");
  }
  return element;
}

function inkOf(element: Element): string {
  return getComputedStyle(element).color;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

for (const look of LOOKS) {
  for (const backing of BACKINGS) {
    test(`reads the page numbers of the preview strip at 4.5 to 1 with ${look.name} over a ${backing} page`, async () => {
      await openPanel("windows", look.theme, look.controls);
      const ground = getComputedStyle(panel()).backgroundColor;
      const numbers = [...document.querySelectorAll("ol li button span")];

      expect(numbers.length).toBeGreaterThan(1);
      for (const number of numbers) {
        expect(
          contrastOverLayers(inkOf(number), [ground], backing),
          number.textContent,
        ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
      }
    });

    test(`reads the time left at 4.5 to 1 with ${look.name} over a ${backing} page`, async () => {
      await openPanel("windows", look.theme, look.controls);
      const ground = getComputedStyle(panel()).backgroundColor;
      const caption = panel().querySelector("p");

      expect(caption).not.toBeNull();

      expect(
        contrastOverLayers(inkOf(caption as Element), [ground], backing),
      ).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    });
  }
}

test("keeps the reader's own page number ink on the other desktops", async () => {
  await openPanel("linux", "light", "dark");
  const current = document.querySelector("ol li[aria-current=page]");

  expect(current).not.toBeNull();
  expect(inkOf(current as Element)).toBe(
    getComputedStyle(page.getByRole("main").element()).color,
  );
});

test("draws the chapter steps and Play with the bar's 20 icons", async () => {
  await openPanel("windows", "light", "dark", true);

  for (const name of [
    "Previous chapter",
    "Next chapter",
    "Start auto scroll",
  ]) {
    const icon = page
      .getByRole("button", { name })
      .element()
      .querySelector("svg");

    expect(icon?.getBoundingClientRect().width, name).toBe(20);
  }
});

test("dims a missing chapter's step once on Windows and as before elsewhere", async () => {
  const dimmed: Record<string, string> = {};

  for (const platform of ["windows", "linux"] as const) {
    await openPanel(platform, "light", "dark");
    dimmed[platform] = getComputedStyle(
      page.getByRole("button", { name: "Next chapter" }).element(),
    ).opacity;
  }

  expect(dimmed).toEqual({ windows: "1", linux: "0.4" });
});
