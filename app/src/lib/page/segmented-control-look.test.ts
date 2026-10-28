import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { followDisplayModes } from "./display-modes";
import { followCorePlatform } from "./platform";
import SegmentedControl from "./SegmentedControl.svelte";

const OPTIONS = ["light", "dark", "system"] as const;

const LABELS = {
  light: () => "Light",
  dark: () => "Dark",
  system: () => "System",
};

async function renderThemeChoice(
  chosen: (typeof OPTIONS)[number] = "dark",
  isSetupRow = false,
): Promise<void> {
  document.documentElement.dataset.theme = "light";
  const heading = document.createElement("h2");
  heading.id = "theme-heading";
  heading.textContent = "Theme";
  document.body.append(heading);
  await render(SegmentedControl<(typeof OPTIONS)[number]>, {
    options: OPTIONS,
    labels: LABELS,
    chosen,
    isSetupRow,
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
  followDisplayModes({ contrast: undefined, transparency: undefined });
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

test("deepens Android's chosen segment under high contrast", async () => {
  followCorePlatform("android");
  followDisplayModes({ contrast: "high", transparency: undefined });

  await renderThemeChoice();

  expect(getComputedStyle(segment("Dark")).backgroundColor).toBe(
    "rgb(0, 42, 24)",
  );
  expect(getComputedStyle(segment("Dark")).color).toBe("rgb(172, 231, 195)");
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
  expect(chosen.borderTopLeftRadius).toBe("20px");
  expect(other.backgroundColor).toBe("rgb(233, 240, 232)");
  expect(other.color).toBe("rgb(88, 97, 90)");
  expect(
    segment("Dark").getBoundingClientRect().left -
      segment("Light").getBoundingClientRect().right,
  ).toBeCloseTo(2, 0);
});

test("leaves Android's connected buttons unpadded, so three labels share a phone's row", async () => {
  followCorePlatform("android");
  await renderThemeChoice();

  expect(getComputedStyle(segment("Light")).paddingInlineStart).toBe("0px");
});

test("rounds both outer ends of Android's connected buttons and keeps 8 inside, as Android draws them", async () => {
  followCorePlatform("android");
  await renderThemeChoice();

  const first = getComputedStyle(segment("Light"));
  const last = getComputedStyle(segment("System"));

  expect(first.borderTopLeftRadius).toBe("20px");
  expect(last.borderTopRightRadius).toBe("20px");
  expect(first.borderTopRightRadius).toBe("8px");
});

test("draws Windows's segmented control as an outlined track of 32px segments with an accent mark under the chosen segment", async () => {
  followCorePlatform("windows");
  await renderThemeChoice("dark", true);

  const chosen = segment("Dark");
  const mark = getComputedStyle(chosen, "::after");

  expect(getComputedStyle(track()).borderTopWidth).toBe("1px");
  expect(getComputedStyle(track()).borderTopLeftRadius).toBe("4px");
  expect(chosen.getBoundingClientRect().height).toBeCloseTo(32, 0);
  expect(getComputedStyle(chosen).fontSize).toBe("14px");
  expect(mark.width).toBe("16px");
  expect(mark.height).toBe("3px");
  expect(mark.backgroundColor).toBe("rgb(47, 111, 79)");
  expect(getComputedStyle(segment("Light"), "::after").width).toBe("auto");
  expect(chosen.className).toContain("text-native-on-segment-selected");
  expect(chosen.className).toContain(
    "forced-colors:after:bg-native-on-segment-selected",
  );
});

test("keeps the same segmented control as Linux's outside the first launch on Windows", async () => {
  followCorePlatform("windows");
  await renderThemeChoice();

  expect(segment("Dark").className).toContain("bg-raised");
  expect(getComputedStyle(track()).borderTopWidth).toBe("0px");
});

test("centres Windows's accent mark under the chosen segment in right-to-left too", async () => {
  followCorePlatform("windows");
  document.documentElement.dir = "rtl";
  await renderThemeChoice("dark", true);

  const chosen = segment("Dark");
  const mark = getComputedStyle(chosen, "::after");
  const centre = chosen.getBoundingClientRect();

  expect(parseFloat(mark.insetInlineStart)).toBeCloseTo(
    (centre.width - 2) / 2,
    0,
  );
  expect(mark.translate).toBe("50%");
  document.documentElement.removeAttribute("dir");
});

test("keeps today's raised segment on Linux", async () => {
  followCorePlatform("linux");
  await renderThemeChoice();

  const classes = segment("Dark").className;

  expect(classes).toContain("bg-raised");
});

test("keeps the chosen first button round at its outer end on Android", async () => {
  followCorePlatform("android");
  await renderThemeChoice("light");

  const first = segment("Light");
  const style = getComputedStyle(first);
  const width = first.getBoundingClientRect().width;
  const height = first.getBoundingClientRect().height;
  const topCorners =
    parseFloat(style.borderTopLeftRadius) +
    parseFloat(style.borderTopRightRadius);
  const shrink = Math.min(1, width / topCorners);

  expect(parseFloat(style.borderTopLeftRadius) * shrink).toBeGreaterThanOrEqual(
    height / 2 - 0.5,
  );
});
