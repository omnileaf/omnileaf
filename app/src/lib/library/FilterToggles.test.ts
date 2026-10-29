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

function renderToggles(chosen: readonly string[]) {
  return render(FilterToggles, {
    label: "Format",
    options: OPTIONS,
    chosen,
    onToggle: () => undefined,
  });
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
  const chip = page.getByRole("button", { name: "CBZ" }).element();
  const style = getComputedStyle(chip);

  expect({
    isCapsule:
      Number.parseFloat(style.borderTopLeftRadius) >=
      chip.getBoundingClientRect().height / 2,
    hasNoBorder: style.borderTopWidth === "0px",
    height: chip.getBoundingClientRect().height,
  }).toEqual({ isCapsule: true, hasNoBorder: true, height: 28 });
});

test("raises the chosen chip onto the accent-soft fill on an iOS phone", async () => {
  await page.viewport(NARROW_WINDOW.width, NARROW_WINDOW.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await renderToggles(["cbz"]);
  const style = getComputedStyle(
    page.getByRole("button", { name: "CBZ" }).element(),
  );

  expect({ fill: style.backgroundColor, ink: style.color }).toEqual({
    fill: resolvedColour("--color-native-accent-soft", "backgroundColor"),
    ink: resolvedColour("--foreground", "color"),
  });
});

const WIDE_WINDOW = { width: 1024, height: 800 } as const;

test("keeps the chip as it was on an iOS tablet, since only phones get the native look", async () => {
  await page.viewport(WIDE_WINDOW.width, WIDE_WINDOW.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await renderToggles([]);
  const chip = page.getByRole("button", { name: "CBZ" }).element();

  expect(getComputedStyle(chip).backgroundColor).toBe(
    resolvedColour("--card", "backgroundColor"),
  );
});
