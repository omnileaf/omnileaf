import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type {
  Platform,
  SeriesBook,
  SeriesOverview,
} from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ContinueCardHarness from "./ContinueCardHarness.svelte";

const PHONE = { width: 400, height: 800 } as const;

const BOOK: SeriesBook = {
  id: "0190a3e4-0000-8000-8000-0000000000b1" as SeriesBook["id"],
  position: 3,
  title: "Volume 3",
  cover: null,
  addedAtMs: 0,
  reading: { state: "started", page: 14 },
  pageCount: 192,
  isBookmarked: false,
  isNew: false,
  isFileMissing: false,
  kind: null,
  numbers: null,
  volume: null,
  section: "volumes",
};

const OVERVIEW: SeriesOverview = {
  id: "0190a3e4-0000-8000-8000-0000000000a1" as SeriesOverview["id"],
  title: "Sample Series 04",
  year: null,
  bookCount: 8,
  readCount: 2,
  bookmarkCount: 0,
  cover: null,
  folder: null,
  upNext: BOOK,
  format: null,
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

async function cardOn(platform: Platform) {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
  await render(ContinueCardHarness, { overview: OVERVIEW });
  const card = page.getByRole("region").element();
  const type = (element: Element | null) => {
    const style = element === null ? undefined : getComputedStyle(element);
    return [
      style?.fontSize,
      style?.lineHeight,
      style?.fontWeight,
      style?.letterSpacing,
    ];
  };
  const link = page.getByRole("link").element();
  return {
    fill: getComputedStyle(card).backgroundColor,
    border: getComputedStyle(card).borderTopWidth,
    title: type(card.querySelector("h2")),
    sub: type(card.querySelector("p")),
    count: type(card.querySelector("p:last-of-type")),
    glyph: link.querySelector("svg") === null ? "font" : "svg",
  };
}

test("draws an Android phone's continue card on the control fill with Android type and a Material play icon", async () => {
  expect(await cardOn("android")).toEqual({
    fill: "rgb(219, 229, 220)",
    border: "0px",
    title: ["16px", "24px", "500", "0.15px"],
    sub: ["14px", "20px", "400", "0.25px"],
    count: ["14px", "20px", "400", "0.25px"],
    glyph: "font",
  });
});

test("keeps an iPhone's continue card as it was", async () => {
  const drawn = await cardOn("ios");

  expect(drawn).toEqual({
    fill: "oklch(1 0 0)",
    border: "1px",
    title: ["16px", "24px", "600", "normal"],
    sub: ["14px", "20px", "400", "normal"],
    count: ["14px", "20px", "400", "normal"],
    glyph: "svg",
  });
});
