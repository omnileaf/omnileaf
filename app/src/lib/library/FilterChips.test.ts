import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";

import "../../app.css";

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
