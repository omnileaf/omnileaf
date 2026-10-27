import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import CoverSkeletons from "./CoverSkeletons.svelte";

const DESKTOP = { width: 1280, height: 800 };

async function captionLinesOn(platform: Platform): Promise<number[]> {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  followCorePlatform(platform);
  const screen = await render(CoverSkeletons);
  const [, title, meta] = screen.container.querySelectorAll(
    '[data-slot="skeleton"]',
  );
  return [title, meta].map((line) => line?.getBoundingClientRect().height ?? 0);
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("sizes linux's loading captions as the 14px name and 12px count they stand for", async () => {
  expect(await captionLinesOn("linux")).toEqual([14, 12]);
});

test("keeps the loading captions as they were on macos", async () => {
  expect(await captionLinesOn("macos")).toEqual([12, 8]);
});
