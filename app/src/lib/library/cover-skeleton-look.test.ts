import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibrarySeries,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import CoverSkeletons from "./CoverSkeletons.svelte";
import SeriesCovers from "./SeriesCovers.svelte";

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

const PHONE = { width: 390, height: 844 };
const SERIES = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: "Tide",
  bookCount: 1,
  volumeCount: 0,
  chapterCount: 1,
  unreadCount: 0,
  isConnected: true,
  cover: null,
} as unknown as LibrarySeries;

function captionHeight(tile: Element | null | undefined): number {
  const cover = tile?.querySelector(".aspect-cover");
  return (
    (tile?.getBoundingClientRect().bottom ?? 0) -
    (cover?.getBoundingClientRect().bottom ?? 0)
  );
}

async function captionHeights(showsCount: boolean) {
  followCorePlatform("android");
  await page.viewport(PHONE.width, PHONE.height);
  const loading = await render(CoverSkeletons, { showsCount });
  const loadingCaption = captionHeight(
    loading.container.querySelector(".aspect-cover")?.parentElement,
  );
  await loading.unmount();
  const covers = await render(SeriesCovers, {
    series: [SERIES],
    isComplete: true,
    coverUrl: () => "",
    view: {
      ...DEFAULT_LIBRARY_VIEW,
      onCovers: {
        ...DEFAULT_LIBRARY_VIEW.onCovers,
        showsVolumeAndChapterCounts: showsCount,
      },
    },
    usesStandIns: false,
  });
  const realCaption = captionHeight(
    covers.container.querySelector("[data-series-id]"),
  );
  return { loadingCaption, realCaption };
}

test("draws the loading caption as tall as the title alone on android with the counts off", async () => {
  const { loadingCaption, realCaption } = await captionHeights(false);

  expect(realCaption).toBeGreaterThan(0);
  expect(loadingCaption).toBeCloseTo(realCaption, 0);
});

test("draws the loading caption as tall as the title and count on android with the counts on", async () => {
  const { loadingCaption, realCaption } = await captionHeights(true);

  expect(realCaption).toBeGreaterThan(0);
  expect(loadingCaption).toBeCloseTo(realCaption, 0);
});
