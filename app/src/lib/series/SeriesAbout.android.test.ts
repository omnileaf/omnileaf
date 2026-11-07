import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform, SeriesOverview } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SeriesAbout from "./SeriesAbout.svelte";

const PHONE = { width: 400, height: 800 } as const;
const SERIES_ID =
  "0190a3e4-0000-8000-8000-0000000000a1" as SeriesOverview["id"];

const OVERVIEW: SeriesOverview = {
  id: SERIES_ID,
  title: "Sample Series 04",
  year: null,
  bookCount: 8,
  readCount: 2,
  bookmarkCount: 0,
  cover: null,
  folder: "Comics",
  upNext: null,
  format: "Manga",
  creators: [],
  summary: null,
  tags: [],
  related: [],
  secondsLeft: null,
  sections: [],
  missingVolumes: [],
  lastVolume: null,
};

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function heroOn(platform: Platform) {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(SeriesAbout, {
    overview: OVERVIEW,
    details: undefined,
    cover: { kind: "none" },
    coverUrl: () => "",
    isWide: false,
    onMarkAll: () => Promise.resolve(),
    onEditDetails: undefined,
  });
  const cover = page.getByRole("img", { name: /^Cover of/ }).element();
  const title = page.getByRole("heading", { level: 1 }).element();
  const coverBox = cover.getBoundingClientRect();
  const titleBox = title.getBoundingClientRect();
  const type = getComputedStyle(title);
  return {
    coverWidth: coverBox.width,
    coverCorner: getComputedStyle(cover).borderTopLeftRadius,
    isBesideCover: titleBox.left >= coverBox.right,
    titleTopFromCover: titleBox.top - coverBox.top,
    title: [type.fontSize, type.lineHeight, type.fontWeight, type.textAlign],
  };
}

test("draws an Android phone's series hero as a cover with the title beside it", async () => {
  const drawn = await heroOn("android");

  expect(drawn).toEqual({
    coverWidth: 112,
    coverCorner: "4px",
    isBesideCover: true,
    titleTopFromCover: 4,
    title: ["24px", "32px", "400", "start"],
  });
});

test("keeps an iPhone's series hero a centred stack under the cover", async () => {
  const drawn = await heroOn("ios");

  expect(drawn.isBesideCover).toBe(false);
  expect(drawn.coverWidth).toBe(120);
  expect(drawn.title[3]).toBe("center");
});
