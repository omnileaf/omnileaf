import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { Button } from "#lib/components/ui/button/index.ts";
import type { Platform } from "#lib/ipc/bindings.ts";
import SeriesBar from "#lib/series/SeriesBar.svelte";
import SectionHeading from "#lib/settings/SectionHeading.svelte";

import PageHeading from "./PageHeading.svelte";
import { followCorePlatform } from "./platform";

const SERIES_BAR_PROPS = {
  title: "Dune",
  onMarkAll: undefined,
  onLabel: undefined,
  onEditDetails: undefined,
  showFolder: { label: "Show folder", onShow: undefined },
};

const PHONE = { width: 402, height: 874 };
const TABLET = { width: 820, height: 1180 };

function onPlatformInLight(platform: Platform): void {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
}

function asElement(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the top bar drew no element");
  }
  return element;
}

function heading(): HTMLElement {
  return asElement(page.getByRole("heading", { level: 1 }).element());
}

function backLink(): HTMLElement {
  return asElement(
    page.getByRole("link", { name: "Back to the library" }).element(),
  );
}

function seriesBar(): HTMLElement {
  return asElement(backLink().closest("header") ?? backLink());
}

function inlineTitle(): HTMLElement {
  return asElement(page.getByText("Dune", { exact: true }).element());
}

beforeEach(async () => {
  await page.viewport(PHONE.width, PHONE.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("sets iOS's large title at 34 on a 41 line, bold in the label colour", async () => {
  onPlatformInLight("ios");
  await render(PageHeading, { title: "Library" });

  const style = getComputedStyle(heading());

  expect(style.fontSize).toBe("34px");
  expect(style.lineHeight).toBe("41px");
  expect(style.fontWeight).toBe("700");
  expect(style.color).toBe("rgb(0, 0, 0)");
});

test("sets Android's page title as title large, centred in a 64 tall bar", async () => {
  onPlatformInLight("android");
  await render(PageHeading, { title: "Library" });

  const style = getComputedStyle(heading());

  expect(style.fontSize).toBe("22px");
  expect(style.lineHeight).toBe("28px");
  expect(style.fontWeight).toBe("400");
  expect(style.color).toBe("rgb(25, 29, 26)");
  expect(heading().getBoundingClientRect().height).toBeCloseTo(64, 0);
});

test("keeps today's page title on Linux", async () => {
  onPlatformInLight("linux");
  await render(PageHeading, { title: "Library" });

  const classes = heading().className;

  expect(classes).toContain("text-page-title");
  expect(classes).not.toContain("native");
});

test("folds iOS's title into a 17 semibold inline title beside 44 glass circles", async () => {
  onPlatformInLight("ios");
  await render(SeriesBar, { ...SERIES_BAR_PROPS, isTitleUnderBar: true });

  const title = getComputedStyle(inlineTitle());
  const back = getComputedStyle(backLink());

  expect(title.fontSize).toBe("17px");
  expect(title.lineHeight).toBe("22px");
  expect(title.fontWeight).toBe("600");
  expect(backLink().getBoundingClientRect().height).toBeCloseTo(44, 0);
  expect(back.backgroundColor).toBe("rgba(255, 255, 255, 0.78)");
  expect(back.color).toBe("rgb(47, 111, 79)");
});

test("draws iOS's scrolled bar over a hairline in the separator colour", async () => {
  onPlatformInLight("ios");
  await render(SeriesBar, { ...SERIES_BAR_PROPS, isTitleUnderBar: true });

  const style = getComputedStyle(seriesBar());

  expect(style.borderBlockEndColor).toBe("oklch(0.235 0.004 286 / 0.22)");
  expect(style.borderBlockEndWidth).not.toBe("0px");
});

test("blurs nothing behind Android's bare bar buttons", async () => {
  onPlatformInLight("android");
  await render(SeriesBar, { ...SERIES_BAR_PROPS, isTitleUnderBar: true });

  expect(getComputedStyle(backLink()).backdropFilter).toBe("none");
});

test("draws Android's 64 tall bar with a bare back arrow, on the surface container once scrolled", async () => {
  onPlatformInLight("android");
  await render(SeriesBar, { ...SERIES_BAR_PROPS, isTitleUnderBar: true });

  const back = getComputedStyle(backLink());

  expect(seriesBar().getBoundingClientRect().height).toBeCloseTo(64, 0);
  expect(getComputedStyle(seriesBar()).backgroundColor).toBe(
    "rgb(233, 240, 232)",
  );
  expect(backLink().getBoundingClientRect().width).toBeCloseTo(48, 0);
  expect(back.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(back.color).toBe("rgb(25, 29, 26)");
  expect(
    backLink().querySelector("[data-icon]")?.getAttribute("data-icon"),
  ).toBe("arrow-left");
  expect(getComputedStyle(inlineTitle()).fontSize).toBe("22px");
});

test("keeps today's series bar chips on Linux", async () => {
  onPlatformInLight("linux");
  await render(SeriesBar, { ...SERIES_BAR_PROPS, isTitleUnderBar: true });

  expect(backLink().className).toContain("bg-card");
  expect(seriesBar().className).toContain("bg-background");
});

test("sets a settings page's Android title as title large", async () => {
  onPlatformInLight("android");
  await render(SectionHeading, { title: "About" });

  const style = getComputedStyle(heading());

  expect(style.fontSize).toBe("22px");
  expect(style.fontWeight).toBe("400");
});

test("draws a bar's header control as iOS's 44 glass circle", async () => {
  onPlatformInLight("ios");
  await render(Button, {
    look: "header-control",
    "aria-label": "Sort and filter",
    class:
      "block-native-target inline-native-target medium:block-touch-target medium:inline-touch-target",
  });

  const control = asElement(
    page.getByRole("button", { name: "Sort and filter" }).element(),
  );

  expect(control.getBoundingClientRect().height).toBeCloseTo(44, 0);
  expect(getComputedStyle(control).backgroundColor).toBe(
    "rgba(255, 255, 255, 0.78)",
  );
});

test("keeps today's page title on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  onPlatformInLight("ios");
  await render(PageHeading, { title: "Library" });

  const classes = heading().className;

  expect(classes).toContain("text-page-title");
  expect(classes).not.toContain("native");
});

test("keeps today's regular weight page title on an Android tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  onPlatformInLight("android");
  await render(PageHeading, { title: "Library" });

  const classes = heading().className;

  expect(classes).toContain("text-page-title");
  expect(classes).not.toContain("native");
  expect(getComputedStyle(heading()).fontWeight).toBe("400");
});

test("keeps today's settings page title on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  onPlatformInLight("ios");
  await render(SectionHeading, { title: "About" });

  const classes = heading().className;

  expect(classes).toContain("text-page-title");
  expect(classes).not.toContain("native");
});

test("keeps today's series bar chips on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  onPlatformInLight("ios");
  await render(SeriesBar, { ...SERIES_BAR_PROPS, isTitleUnderBar: true });

  expect(backLink().className).toContain("bg-card");
});

test("keeps today's header control on an iPad", async () => {
  await page.viewport(TABLET.width, TABLET.height);
  onPlatformInLight("ios");
  await render(Button, {
    look: "header-control",
    "aria-label": "Sort and filter",
    class:
      "block-native-target inline-native-target medium:block-touch-target medium:inline-touch-target",
  });

  const control = asElement(
    page.getByRole("button", { name: "Sort and filter" }).element(),
  );

  expect(control.getBoundingClientRect().height).toBeCloseTo(48, 0);
  expect(getComputedStyle(control).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});
