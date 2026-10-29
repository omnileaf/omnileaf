import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { LibraryFilterChoices, Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import FilterAndSort from "./FilterAndSort.svelte";
import { NEW_LIBRARY_LISTING } from "./library-listing";

const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1280, height: 800 };
const LARGE_DETENT = 0.92;

const CHOICES: LibraryFilterChoices = {
  formats: ["comic", "manga"],
  languages: [],
  tags: [],
  ratesAdult: false,
  keepsBookmarks: false,
  smart: [],
};

async function openSheetOn(platform: Platform) {
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await page.viewport(PHONE.width, PHONE.height);
  await render(FilterAndSort, {
    listing: NEW_LIBRARY_LISTING,
    choices: CHOICES,
    matching: 24,
    docks: false,
    panelId: "filters",
    isOpen: true,
    showsButton: false,
    onChoose: () => undefined,
    onOpen: () => undefined,
  });
}

function boxOf(element: Element): DOMRect {
  return element.getBoundingClientRect();
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("raises the sort and filter sheet to the large detent on an iPhone", async () => {
  await openSheetOn("ios");

  const sheet = page.getByRole("dialog").element();

  expect(Math.round(boxOf(sheet).height)).toBe(
    Math.round(PHONE.height * LARGE_DETENT),
  );
});

test("puts Close and Reset on either side of a centred title on an iPhone", async () => {
  await openSheetOn("ios");

  const close = boxOf(page.getByRole("button", { name: "Close" }).element());
  const title = boxOf(
    page.getByText("Sort and filter", { exact: true }).element(),
  );
  const reset = boxOf(page.getByRole("button", { name: "Reset" }).element());

  expect(close.right).toBeLessThanOrEqual(title.left);
  expect(title.right).toBeLessThanOrEqual(reset.left);
  expect(Math.abs(title.left + title.width / 2 - PHONE.width / 2)).toBeLessThan(
    1,
  );
  expect(close.width).toBe(close.height);
});

test("ends the sheet with a full-width large primary button counting the matches on an iPhone", async () => {
  await openSheetOn("ios");

  const sheet = boxOf(page.getByRole("dialog").element());
  const show = page.getByRole("button", { name: "Show 24 series" }).element();

  expect(boxOf(show).height).toBe(50);
  expect(sheet.width - boxOf(show).width).toBe(32);
  expect(getComputedStyle(show).backgroundColor).toBe("rgb(47, 111, 79)");
});

test("keeps the sort and filter sheet as it was on an Android phone", async () => {
  await openSheetOn("android");

  const sheet = boxOf(page.getByRole("dialog").element());
  const show = boxOf(
    page.getByRole("button", { name: "Show 24 series" }).element(),
  );

  await expect
    .element(page.getByRole("button", { name: "Close" }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: "Reset" }))
    .toBeInTheDocument();
  expect(Math.round(sheet.height)).not.toBe(
    Math.round(PHONE.height * LARGE_DETENT),
  );
  expect(show.height).not.toBe(50);
});

test("keeps the side panel on a wide iOS window", async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  await page.viewport(WIDE.width, WIDE.height);
  await render(FilterAndSort, {
    listing: NEW_LIBRARY_LISTING,
    choices: CHOICES,
    matching: 24,
    docks: false,
    panelId: "filters",
    isOpen: true,
    showsButton: false,
    onChoose: () => undefined,
    onOpen: () => undefined,
  });

  const panel = boxOf(page.getByRole("dialog").element());

  expect(panel.width).toBeLessThan(WIDE.width / 2);
  expect(Math.round(panel.height)).toBe(WIDE.height);
});
