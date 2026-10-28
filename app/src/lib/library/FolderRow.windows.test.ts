import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import FolderRow from "./FolderRow.svelte";

const HOME = {
  kind: "home",
  name: "Omnileaf",
  location: "C:\\Omnileaf",
  isAvailable: true,
} as const;

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

async function tileOnWindows(isOwnCard: boolean | undefined) {
  await page.viewport(1280, 800);
  document.documentElement.dataset.platform = "windows";
  document.documentElement.dataset.theme = "light";
  const screen = await render(FolderRow, {
    folder: HOME,
    ...(isOwnCard === undefined ? {} : { isOwnCard }),
  });
  const item = screen.container.querySelector("[data-slot=item]");
  const tile = screen.container.querySelector("[data-slot=item-media]");
  if (item === null || tile === null) {
    throw new Error("the folder row drew no item");
  }
  return { item: getComputedStyle(item), tile: getComputedStyle(tile) };
}

test("keeps the home tile's tint and the row's padding as they are in Settings on Windows", async () => {
  const kept = await tileOnWindows(undefined);

  expect(kept.tile.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(kept.item.paddingInlineEnd).toBe("8px");
});

test("drops the tile's fill and widens the row when it is a card of its own on Windows", async () => {
  const card = await tileOnWindows(true);

  expect(card.tile.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(card.item.paddingInlineEnd).toBe("16px");
});
