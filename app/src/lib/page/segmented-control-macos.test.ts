import { afterEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
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
  chosen: (typeof OPTIONS)[number] = "dark",
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
    chosen,
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

test("fills the chosen segment with the accent green on macOS", async () => {
  await renderOnMac();

  expect(getComputedStyle(segment("Dark")).backgroundColor).toBe(
    resolvedColour("--native-color-button-primary", "backgroundColor"),
  );
});

test.each(["light", "dark"] as const)(
  "sets the chosen segment's ink in white on macOS in %s",
  async (theme) => {
    await renderOnMac(theme);

    expect(getComputedStyle(segment("Dark")).color).toBe("rgb(255, 255, 255)");
  },
);

test("hides the dividers beside the chosen segment on macOS", async () => {
  await renderOnMac();

  expect(getComputedStyle(segment("Dark"), "::after").opacity).toBe("0");
  expect(getComputedStyle(segment("System"), "::after").opacity).toBe("0");
});

test("draws a 1 point divider between two idle segments on macOS", async () => {
  await renderOnMac("light", "regular", "light");

  const divider = getComputedStyle(segment("System"), "::after");

  expect({ opacity: divider.opacity, width: divider.width }).toEqual({
    opacity: "1",
    width: "1px",
  });
  expect(getComputedStyle(segment("System")).position).toBe("relative");
});

test("keeps the small size at 20 points on a wide macOS window", async () => {
  await renderOnMac("light", "small");
  await page.viewport(1600, 900);

  expect(track().getBoundingClientRect().height).toBe(20);
});

test("tints an idle segment under the pointer on macOS", async () => {
  await renderOnMac();

  await userEvent.unhover(segment("Light"));
  const resting = getComputedStyle(segment("Light")).backgroundColor;
  await userEvent.hover(segment("Light"));

  await expect
    .poll(() => getComputedStyle(segment("Light")).backgroundColor)
    .not.toBe(resting);
  await userEvent.unhover(segment("Light"));
});

test("sets the focus ring off the chosen segment's accent fill on macOS", async () => {
  await renderOnMac();

  expect(segment("Dark").className).toContain("focus-visible:outline-offset-1");
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
