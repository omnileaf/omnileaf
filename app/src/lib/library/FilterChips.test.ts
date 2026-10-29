import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { followCorePlatform } from "#lib/page/platform.ts";

import FilterChips from "./FilterChips.svelte";

const FEW = [
  { id: "readState", label: "Unread" },
  { id: "language", label: "Japanese" },
];
const MANY = [
  "Unread",
  "Japanese",
  "Manga",
  "Slice of life",
  "Seinen",
  "Sea stories",
  "Quick reads",
  "Bookmarked",
].map((label) => ({ id: label, label }));
const NARROW = "22.5rem";
const WIDE = "48rem";

async function chipsIn(
  width: string,
  chips: readonly { id: string; label: string }[],
) {
  const handlers = {
    onRemove: vi.fn(),
    onMore: vi.fn(),
    onClearAll: vi.fn(),
  };
  const screen = await render(FilterChips, { chips, ...handlers });
  screen.container.style.inlineSize = width;
  return { screen, ...handlers };
}

function middleOf(element: Element): number {
  const box = element.getBoundingClientRect();
  return box.top + box.height / 2;
}

test("shows every chip, then Clear all, when they all fit", async () => {
  const { screen } = await chipsIn(WIDE, FEW);

  const inUse = screen.getByRole("list", { name: "Filters in use" });

  await expect.element(inUse.getByText("Unread")).toBeVisible();
  await expect.element(inUse.getByText("Japanese")).toBeVisible();
  expect(inUse.getByRole("button", { name: /more filter/ }).elements()).toEqual(
    [],
  );
});

test("folds the chips that don't fit into +N, keeping Clear all on the same line", async () => {
  const { screen } = await chipsIn(NARROW, MANY);
  const inUse = screen.getByRole("list", { name: "Filters in use" });
  const more = inUse.getByRole("button", { name: /^Show \d+ more filters?$/ });

  await expect.element(more).toBeVisible();

  const shown = inUse.getByRole("button", { name: /^Remove / }).elements();
  const folded = MANY.length - shown.length;
  expect(shown.length).toBeGreaterThan(0);
  expect(folded).toBeGreaterThan(0);
  await expect.element(more).toHaveTextContent(`+ ${String(folded)}`);
  const clearAll = screen.getByRole("button", { name: "Clear all" }).element();
  const line = screen.container.getBoundingClientRect();
  expect(Math.abs(middleOf(clearAll) - middleOf(more.element()))).toBeLessThan(
    1,
  );
  expect(clearAll.getBoundingClientRect().right).toBeLessThanOrEqual(
    line.right,
  );
  expect(more.element().getBoundingClientRect().right).toBeLessThanOrEqual(
    clearAll.getBoundingClientRect().left,
  );
});

test("opens Sort and filter from +N", async () => {
  const { screen, onMore } = await chipsIn(NARROW, MANY);

  await screen
    .getByRole("button", { name: /^Show \d+ more filters?$/ })
    .click();

  expect(onMore).toHaveBeenCalledOnce();
});

test("removes a chip with its cross, and every filter with Clear all", async () => {
  const { screen, onRemove, onClearAll } = await chipsIn(WIDE, FEW);

  await screen.getByRole("button", { name: "Remove Japanese" }).click();
  await screen.getByRole("button", { name: "Clear all" }).click();

  expect(onRemove).toHaveBeenCalledWith("language");
  expect(onClearAll).toHaveBeenCalledOnce();
});

const PHONE = { width: 390, height: 800 } as const;
const TABLET = { width: 1024, height: 800 } as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function chipsOn(
  platform: "ios" | "android",
  size: { width: number; height: number },
  chips: readonly { id: string; label: string }[],
) {
  await page.viewport(size.width, size.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  return chipsIn("100%", chips);
}

function removableChip(label: string): HTMLElement {
  const chip = page
    .getByRole("button", { name: `Remove ${label}` })
    .element()
    .closest("li");
  if (chip === null) {
    throw new Error(`no chip holds ${label}`);
  }
  return chip;
}

test("draws each filter in use as a 28 point capsule on the control fill on an iPhone", async () => {
  await chipsOn("ios", PHONE, FEW);

  for (const label of ["Unread", "Japanese"]) {
    const chip = removableChip(label);
    const style = getComputedStyle(chip);

    expect({
      isCapsule:
        Number.parseFloat(style.borderTopLeftRadius) >=
        chip.getBoundingClientRect().height / 2,
      hasNoBorder: style.borderTopWidth === "0px",
      height: chip.getBoundingClientRect().height,
      fill: style.backgroundColor,
    }).toEqual({
      isCapsule: true,
      hasNoBorder: true,
      height: 28,
      fill: resolvedColour("--color-native-button-outline", "backgroundColor"),
    });
  }
});

test("spaces the chips 8 points apart on an iPhone", async () => {
  await chipsOn("ios", PHONE, FEW);

  const first = removableChip("Unread").getBoundingClientRect();
  const second = removableChip("Japanese").getBoundingClientRect();

  expect(second.left - first.right).toBe(8);
});

test("draws +N as a 28 point capsule and Clear all as a plain button on an iPhone", async () => {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  const { screen } = await chipsIn("22.5rem", MANY);

  const more = screen
    .getByRole("button", { name: /^Show \d+ more filters?$/ })
    .element();
  const clearAll = getComputedStyle(
    screen.getByRole("button", { name: "Clear all" }).element(),
  );

  expect(more.getBoundingClientRect().height).toBe(28);
  expect(getComputedStyle(more).backgroundColor).toBe(
    resolvedColour("--color-native-button-outline", "backgroundColor"),
  );
  expect(clearAll.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(clearAll.color).toBe(
    resolvedColour("--color-native-on-button-plain", "color"),
  );
});

function chipLook(label: string) {
  const style = getComputedStyle(removableChip(label));
  return { border: style.borderTopWidth, fill: style.backgroundColor };
}

test("keeps the bordered chips on an iPad and an Android phone", async () => {
  await chipsOn("ios", TABLET, FEW);
  const onIpad = chipLook("Unread");
  document.body.replaceChildren();
  await chipsOn("android", PHONE, FEW);
  const onAndroid = chipLook("Unread");

  const bordered = {
    border: "1px",
    fill: resolvedColour("--card", "backgroundColor"),
  };
  expect(onIpad).toEqual(bordered);
  expect(onAndroid).toEqual(bordered);
});
