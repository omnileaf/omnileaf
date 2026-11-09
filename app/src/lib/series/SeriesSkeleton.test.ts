import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SeriesSkeleton from "./SeriesSkeleton.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 700, height: 1000 };

async function blocksOn(platform: Platform): Promise<readonly DOMRect[]> {
  document.body.replaceChildren();
  followCorePlatform(platform);
  await render(SeriesSkeleton);
  return [...document.querySelectorAll('[data-slot="skeleton"]')].map((block) =>
    block.getBoundingClientRect(),
  );
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

test("sets Android's loading page as the cover beside four lines, the actions, the card and the books", async () => {
  const blocks = await blocksOn("android");

  const [cover, firstLine] = blocks;
  expect(blocks.map(({ height }) => Math.round(height))).toEqual([
    168, 24, 16, 16, 12, 40, 64, 148, 18, 14, 18, 14,
  ]);
  expect(cover?.width).toBe(112);
  expect(firstLine?.left).toBeGreaterThanOrEqual(cover?.right ?? Infinity);
  expect(firstLine?.top).toBeLessThan(cover?.bottom ?? 0);
});

test("keeps the centred cover on an iPhone's loading page", async () => {
  const [cover] = await blocksOn("ios");

  expect((cover?.left ?? 0) + (cover?.width ?? 0) / 2).toBeCloseTo(
    PHONE.width / 2,
    0,
  );
});

test("keeps the loading page as it was on an Android tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);

  const [cover] = await blocksOn("android");

  expect(cover?.width).not.toBe(112);
});
