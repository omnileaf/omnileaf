import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import FilterToggles from "./FilterToggles.svelte";

const OPTIONS = [
  { value: "cbz", label: "CBZ" },
  { value: "epub", label: "EPUB" },
] as const;
const NARROW_WINDOW = { width: 390, height: 800 } as const;
const WIDE_WINDOW = { width: 1024, height: 800 } as const;

function renderToggles(chosen: readonly string[]) {
  return render(FilterToggles, {
    label: "Format",
    options: OPTIONS,
    chosen,
    onToggle: () => undefined,
  });
}

function chip(): HTMLElement {
  const element = page.getByRole("button", { name: "CBZ" }).element();
  if (!(element instanceof HTMLElement)) {
    throw new Error("the chip drew no element");
  }
  return element;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws an unchosen chip as a native capsule on an iOS phone", async () => {
  await page.viewport(NARROW_WINDOW.width, NARROW_WINDOW.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await renderToggles([]);
  const element = chip();
  const style = getComputedStyle(element);

  expect({
    isCapsule:
      Number.parseFloat(style.borderTopLeftRadius) >=
      element.getBoundingClientRect().height / 2,
    hasNoBorder: style.borderTopWidth === "0px",
    height: element.getBoundingClientRect().height,
    fill: style.backgroundColor,
  }).toEqual({
    isCapsule: true,
    hasNoBorder: true,
    height: 28,
    fill: resolvedColour("--color-native-button-outline", "backgroundColor"),
  });
});

for (const theme of ["light", "dark"] as const) {
  test(`raises the chosen chip onto the accent-soft fill on an iOS phone in ${theme}`, async () => {
    await page.viewport(NARROW_WINDOW.width, NARROW_WINDOW.height);
    document.documentElement.dataset.theme = theme;
    followCorePlatform("ios");
    await renderToggles(["cbz"]);
    const style = getComputedStyle(chip());

    expect({ fill: style.backgroundColor, ink: style.color }).toEqual({
      fill: resolvedColour("--color-native-accent-soft", "backgroundColor"),
      ink: resolvedColour("--foreground", "color"),
    });
  });
}

test("keeps the chip as it was on an iOS tablet, since only phones get the native look", async () => {
  await page.viewport(WIDE_WINDOW.width, WIDE_WINDOW.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await renderToggles([]);

  expect(getComputedStyle(chip()).backgroundColor).toBe(
    resolvedColour("--card", "backgroundColor"),
  );
});

test("keeps a chosen chip on the chip fill off iOS", async () => {
  await page.viewport(NARROW_WINDOW.width, NARROW_WINDOW.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("linux");
  await renderToggles(["cbz"]);

  expect(getComputedStyle(chip()).backgroundColor).toBe(
    resolvedColour("--color-chip", "backgroundColor"),
  );
});

test("keeps the capsule fill while a pointer hovers an unchosen chip on an iOS phone", async () => {
  await page.viewport(NARROW_WINDOW.width, NARROW_WINDOW.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await renderToggles([]);
  await page.getByRole("button", { name: "CBZ" }).hover();

  expect(getComputedStyle(chip()).backgroundColor).toBe(
    resolvedColour("--color-native-button-outline", "backgroundColor"),
  );
});
