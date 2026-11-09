import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SeriesWithoutBooks from "./SeriesWithoutBooks.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const CLEAR = "rgba(0, 0, 0, 0)";

async function cardOn(platform: Platform): Promise<CSSStyleDeclaration> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  await render(SeriesWithoutBooks, {
    platform,
    onRescan: vi.fn(() => Promise.resolve()),
    onShowFolder: vi.fn(),
  });
  const card = document.body.firstElementChild?.firstElementChild;
  if (card === null || card === undefined) {
    throw new Error("the empty series drew no card");
  }
  return getComputedStyle(card);
}

beforeEach(async () => {
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
});

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws Android's empty series as an outlined card on the page colour", async () => {
  const card = await cardOn("android");

  expect([card.backgroundColor, card.borderTopWidth]).toEqual([CLEAR, "1px"]);
});

test("keeps the filled card on an iPhone", async () => {
  const card = await cardOn("ios");

  expect(card.backgroundColor).not.toBe(CLEAR);
});

test("keeps the filled card on an Android tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);

  const card = await cardOn("android");

  expect(card.backgroundColor).not.toBe(CLEAR);
});
