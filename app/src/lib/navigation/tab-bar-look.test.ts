import type { ComponentProps } from "svelte";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { screenshotModeTurned } from "../../../tests/components/screenshot-mode.ts";
import WithAppContext from "../../../tests/components/WithAppContext.svelte";
import AppNavigation from "./AppNavigation.svelte";

const PHONE = { width: 390, height: 844 };

const NavigationWithAppContext = WithAppContext<
  ComponentProps<typeof AppNavigation>
>;

async function renderOnPhoneInLight(platform: Platform): Promise<void> {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(NavigationWithAppContext, {
    screenshotMode: screenshotModeTurned("off"),
    page: AppNavigation,
    pageProps: { current: "library" },
  });
}

function asElement(element: Element | null | undefined): Element {
  if (element === null || element === undefined) {
    throw new Error("the tab bar drew no element");
  }
  return element;
}

function bar(): Element {
  return asElement(page.getByRole("navigation", { name: "Main" }).element());
}

function tab(name: string): Element {
  return asElement(page.getByRole("link", { name }).element());
}

function iconOf(name: string): Element {
  return asElement(tab(name).querySelector("svg"));
}

function labelOf(name: string): Element {
  return asElement(page.getByText(name, { exact: true }).element());
}

function glassPill(): Element {
  return asElement(bar().querySelector('li[aria-hidden="true"]'));
}

function toneOf(name: string): Element {
  return asElement(tab(name).querySelector('[data-slot="navigation-pill"]'));
}

beforeEach(async () => {
  await page.viewport(PHONE.width, PHONE.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("floats iOS's tabs in a 62 tall capsule of 84 wide cells inside 10 of padding", async () => {
  await renderOnPhoneInLight("ios");

  const capsule = bar().getBoundingClientRect();
  const library = tab("Library").getBoundingClientRect();

  expect(capsule.height).toBeCloseTo(62, 0);
  expect(capsule.width).toBeLessThanOrEqual(360);
  expect(library.width).toBeCloseTo(84, 0);
  expect(library.left - capsule.left).toBeCloseTo(10, 0);
});

test("sits iOS's current tab on a 54 tall pill inset 4, in the accent", async () => {
  await renderOnPhoneInLight("ios");

  const pill = glassPill().getBoundingClientRect();
  const capsule = bar().getBoundingClientRect();

  expect(pill.height).toBeCloseTo(54, 0);
  expect(pill.top - capsule.top).toBeCloseTo(4, 0);
  expect(getComputedStyle(glassPill()).backgroundColor).toBe(
    "rgba(118, 118, 128, 0.12)",
  );
  expect(getComputedStyle(tab("Library")).color).toBe("rgb(47, 111, 79)");
  expect(getComputedStyle(iconOf("Library")).color).toBe("rgb(47, 111, 79)");
  expect(getComputedStyle(tab("Browse")).color).toBe("rgb(0, 0, 0)");
});

test("sets iOS's tab labels at 10 on a 12 line, semibold, beside 22 icons", async () => {
  await renderOnPhoneInLight("ios");

  const label = getComputedStyle(labelOf("Library"));
  const icon = iconOf("Browse").getBoundingClientRect();

  expect(label.fontSize).toBe("10px");
  expect(label.lineHeight).toBe("12px");
  expect(label.fontWeight).toBe("590");
  expect(icon.width).toBeCloseTo(22, 0);
  expect(icon.height).toBeCloseTo(22, 0);
});

test("docks Android's 64 tall navigation bar on the surface container", async () => {
  await renderOnPhoneInLight("android");

  const row = asElement(bar().querySelector("ul")).getBoundingClientRect();

  expect(row.height).toBeCloseTo(64, 0);
  expect(getComputedStyle(bar()).backgroundColor).toBe("rgb(233, 240, 232)");
});

test("sits Android's current icon on a 56 by 32 secondary container pill", async () => {
  await renderOnPhoneInLight("android");

  const pill = toneOf("Library").getBoundingClientRect();

  expect(pill.width).toBeCloseTo(56, 0);
  expect(pill.height).toBeCloseTo(32, 0);
  expect(getComputedStyle(toneOf("Library")).backgroundColor).toBe(
    "rgb(208, 232, 215)",
  );
  expect(getComputedStyle(iconOf("Library")).color).toBe("rgb(65, 87, 73)");
  expect(getComputedStyle(tab("Library")).color).toBe("rgb(50, 106, 77)");
  expect(getComputedStyle(tab("Browse")).color).toBe("rgb(88, 97, 90)");
});

test("sets Android's tab labels as label medium, 12 on a 16 line at 500, beside 24 icons", async () => {
  await renderOnPhoneInLight("android");

  const current = getComputedStyle(labelOf("Library"));
  const other = getComputedStyle(labelOf("Browse"));

  expect(current.fontSize).toBe("12px");
  expect(current.lineHeight).toBe("16px");
  expect(current.fontWeight).toBe("500");
  expect(other.fontWeight).toBe("500");
  expect(current.letterSpacing).toBe("0.5px");
  expect(iconOf("Browse").getBoundingClientRect().width).toBeCloseTo(24, 0);
});

test("keeps today's sidebar on Linux at a phone's width", async () => {
  await renderOnPhoneInLight("linux");

  const classes = [bar(), tab("Library"), labelOf("Library")]
    .map((element) => element.className)
    .join(" ");

  expect(classes).not.toContain("native");
  expect(getComputedStyle(tab("Library")).fontWeight).toBe("500");
  expect(getComputedStyle(tab("Library")).fontSize).toBe("12px");
});
