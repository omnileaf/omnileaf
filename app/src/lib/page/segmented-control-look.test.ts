import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followCorePlatform } from "./platform";
import SegmentedControl from "./SegmentedControl.svelte";

const OPTIONS = ["light", "dark", "system"] as const;

const LABELS = {
  light: () => "Light",
  dark: () => "Dark",
  system: () => "System",
};

async function renderThemeChoice(): Promise<void> {
  document.documentElement.dataset.theme = "light";
  const heading = document.createElement("h2");
  heading.id = "theme-heading";
  heading.textContent = "Theme";
  document.body.append(heading);
  await render(SegmentedControl<(typeof OPTIONS)[number]>, {
    options: OPTIONS,
    labels: LABELS,
    chosen: "dark",
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

test("draws iOS's capsule track with a raised pill under the chosen option", async () => {
  followCorePlatform("ios");
  await renderThemeChoice();

  const chosen = getComputedStyle(segment("Dark"));

  expect(track().getBoundingClientRect().height).toBeCloseTo(32, 0);
  expect(getComputedStyle(track()).backgroundColor).toBe(
    "rgba(118, 118, 128, 0.12)",
  );
  expect(segment("Dark").getBoundingClientRect().height).toBeCloseTo(28, 0);
  expect(chosen.backgroundColor).toBe("rgb(255, 255, 255)");
  expect(chosen.fontWeight).toBe("590");
  expect(chosen.fontSize).toBe("13px");
});

test("draws Android's connected buttons with the chosen one filled", async () => {
  followCorePlatform("android");
  await renderThemeChoice();

  const chosen = getComputedStyle(segment("Dark"));
  const other = getComputedStyle(segment("Light"));

  expect(segment("Light").getBoundingClientRect().height).toBeCloseTo(40, 0);
  expect(getComputedStyle(track()).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(chosen.backgroundColor).toBe("rgb(50, 106, 77)");
  expect(chosen.color).toBe("rgb(230, 255, 237)");
  expect(chosen.borderTopLeftRadius).toBe("999px");
  expect(other.backgroundColor).toBe("rgb(233, 240, 232)");
  expect(other.color).toBe("rgb(88, 97, 90)");
  expect(
    segment("Dark").getBoundingClientRect().left -
      segment("Light").getBoundingClientRect().right,
  ).toBeCloseTo(2, 0);
});

test("rounds both outer ends of Android's connected buttons", async () => {
  followCorePlatform("android");
  await renderThemeChoice();

  const first = getComputedStyle(segment("Light"));
  const last = getComputedStyle(segment("System"));

  expect(first.borderTopLeftRadius).toBe("20px");
  expect(last.borderTopRightRadius).toBe("20px");
  expect(first.borderTopRightRadius).toBe("12px");
});

test("keeps today's raised segment on Linux", async () => {
  followCorePlatform("linux");
  await renderThemeChoice();

  const classes = segment("Dark").className;

  expect(classes).toContain("bg-raised");
});
