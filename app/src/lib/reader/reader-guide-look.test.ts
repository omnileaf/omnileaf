import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import ReaderGuideHarness from "./ReaderGuideHarness.svelte";
import type { TapZones } from "./reader-settings.svelte.ts";

const PHONE = { width: 400, height: 800 };
const ZONE_PADDING = "16px";

async function openGuide(platform: Platform, zones: TapZones): Promise<void> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
  await render(ReaderGuideHarness, { platform, zones });
}

function zoneNamed(name: string): HTMLElement {
  const element = [
    ...document.querySelectorAll<HTMLElement>("[aria-hidden='true'] > div"),
  ].find((zone) => zone.textContent.trim() === name);
  if (element === undefined) {
    throw new Error(`the guide drew no ${name} zone`);
  }
  return element;
}

function card(): HTMLElement {
  const element = page.getByRole("note").element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the guide drew no card");
  }
  return element;
}

function tinted(token: string): string {
  return resolvedColour(
    `color-mix(in oklab, var(${token}) 90%, transparent)`,
    "backgroundColor",
  );
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("tints Android's tap zones in the soft accent with a 14 label and no dashed edge", async () => {
  await openGuide("android", "lShape");
  const style = getComputedStyle(zoneNamed("Next page"));

  expect(style.backgroundColor).toBe(tinted("--native-color-tab-pill"));
  expect(style.color).toBe(
    resolvedColour("--native-color-on-tab-pill", "color"),
  );
  expect(style.borderTopWidth).toBe("0px");
  expect(style.fontSize).toBe("14px");
  expect(style.lineHeight).toBe("20px");
  expect(style.paddingTop).toBe(ZONE_PADDING);
});

test("draws Android's controls zone on the dialog colour", async () => {
  await openGuide("android", "lShape");

  expect(getComputedStyle(zoneNamed("Show the controls")).backgroundColor).toBe(
    resolvedColour("--native-color-reader-guide-menu-zone", "backgroundColor"),
  );
});

test("heads Android's guide card with no badge and ends it with a plain Got it", async () => {
  await openGuide("android", "lShape");
  const done = page.getByRole("button", { name: "Got it" }).element();

  expect(card().querySelector("svg, [data-icon]")).toBeNull();
  expect(getComputedStyle(done).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(done.getBoundingClientRect().width).toBeLessThan(
    card().getBoundingClientRect().width / 2,
  );
  const title = document.getElementById(
    card().getAttribute("aria-labelledby") ?? "",
  );
  expect(title && getComputedStyle(title).fontSize).toBe("16px");
});

test("keeps the dashed zones and the badge on the other platforms", async () => {
  await openGuide("linux", "lShape");

  expect(getComputedStyle(zoneNamed("Next page")).borderTopStyle).toBe(
    "dashed",
  );
  expect(card().querySelector("svg")).not.toBeNull();
});

test("draws Android's Got it as a plain button in the plain-button colour", async () => {
  await openGuide("android", "lShape");
  const done = page.getByRole("button", { name: "Got it" }).element();

  expect(getComputedStyle(done).color).toBe(
    resolvedColour("--native-color-on-button-plain", "color"),
  );
});

test("draws the controls zone like every other zone on the other platforms", async () => {
  await openGuide("linux", "lShape");

  expect(zoneNamed("Show the controls").className).toBe(
    zoneNamed("Next page").className,
  );
  expect(getComputedStyle(zoneNamed("Show the controls")).borderTopStyle).toBe(
    "dashed",
  );
});

test("draws Android's controls zone on the dialog colour with the edge zones as columns", async () => {
  await openGuide("android", "edges");

  expect(getComputedStyle(zoneNamed("Show the controls")).backgroundColor).toBe(
    resolvedColour("--native-color-reader-guide-menu-zone", "backgroundColor"),
  );
  expect(getComputedStyle(zoneNamed("Previous page")).backgroundColor).toBe(
    tinted("--native-color-tab-pill"),
  );
});
