import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "./platform";
import SegmentedControl from "./SegmentedControl.svelte";

const OPTIONS = ["light", "dark", "system"] as const;

const LABELS = {
  light: () => "Light",
  dark: () => "Dark",
  system: () => "System",
};

async function renderOnMac(
  theme: "light" | "dark" = "light",
  size: "small" | "regular" = "regular",
): Promise<void> {
  document.documentElement.dataset.theme = theme;
  followCorePlatform("macos");
  await page.viewport(1024, 800);
  const heading = document.createElement("h2");
  heading.id = "theme-heading";
  heading.textContent = "Theme";
  document.body.append(heading);
  await render(SegmentedControl<(typeof OPTIONS)[number]>, {
    options: OPTIONS,
    labels: LABELS,
    chosen: "dark",
    size,
    labelledBy: "theme-heading",
    onChoose: () => undefined,
  });
}

function asElement(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the segmented control drew no element");
  }
  return element;
}

function segment(name: string): HTMLElement {
  return asElement(page.getByRole("radio", { name }).element());
}

function track(): HTMLElement {
  return asElement(page.getByRole("radiogroup", { name: "Theme" }).element());
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws a 24 point recessed track with 6 point corners on macOS", async () => {
  await renderOnMac();

  const style = getComputedStyle(track());

  expect(track().getBoundingClientRect().height).toBe(24);
  expect(style.borderTopLeftRadius).toBe("6px");
  expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0.1)");
});

test("darkens the track to the dark control fill on macOS", async () => {
  await renderOnMac("dark");

  expect(getComputedStyle(track()).backgroundColor).toBe(
    "rgba(255, 255, 255, 0.09)",
  );
});

test("sets each segment in 13 point medium type with 10 point sides on macOS", async () => {
  await renderOnMac();

  const style = getComputedStyle(segment("Light"));

  expect({
    size: style.fontSize,
    weight: style.fontWeight,
    side: style.paddingLeft,
    radius: style.borderTopLeftRadius,
  }).toEqual({ size: "13px", weight: "510", side: "10px", radius: "6px" });
});

test("fills the chosen segment with the accent and its on-accent ink on macOS", async () => {
  await renderOnMac();

  const style = getComputedStyle(segment("Dark"));

  expect({ fill: style.backgroundColor, ink: style.color }).toEqual({
    fill: resolvedColour("--color-accent", "backgroundColor"),
    ink: resolvedColour("--color-on-accent", "color"),
  });
});

test("draws a 1 point divider between idle segments and hides the ones beside the chosen one on macOS", async () => {
  await renderOnMac();

  const beforeChosen = getComputedStyle(segment("Dark"), "::after");
  const afterChosen = getComputedStyle(segment("System"), "::after");

  expect(beforeChosen.opacity).toBe("0");
  expect(afterChosen.opacity).toBe("0");
  expect(getComputedStyle(segment("Dark"), "::after").width).toBe("1px");
});

test("draws the divider between two idle segments on macOS", async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("macos");
  await page.viewport(1024, 800);
  const heading = document.createElement("h2");
  heading.id = "theme-heading";
  heading.textContent = "Theme";
  document.body.append(heading);
  await render(SegmentedControl<(typeof OPTIONS)[number]>, {
    options: OPTIONS,
    labels: LABELS,
    chosen: "light",
    labelledBy: "theme-heading",
    onChoose: () => undefined,
  });

  const divider = getComputedStyle(segment("System"), "::after");

  expect(divider.opacity).toBe("1");
  expect(divider.width).toBe("1px");
});

test("draws the small size as a 20 point track with 5 point corners and 11 point type on macOS", async () => {
  await renderOnMac("light", "small");

  const style = getComputedStyle(segment("Light"));

  expect(track().getBoundingClientRect().height).toBe(20);
  expect(getComputedStyle(track()).borderTopLeftRadius).toBe("5px");
  expect({ radius: style.borderTopLeftRadius, size: style.fontSize }).toEqual({
    radius: "5px",
    size: "11px",
  });
});
