import { clearMocks, mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { Platform } from "#lib/ipc/bindings.ts";
import type { CoverPath } from "#lib/library/cover-url.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SeriesBand from "./SeriesBand.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const PICTURE = {
  kind: "picture",
  path: "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1" as CoverPath,
} as const;

async function bandOn(platform: Platform) {
  followCorePlatform(platform);
  await render(SeriesBand, { cover: PICTURE });
  const band = document.querySelector("[data-series-band]");
  const picture = band?.querySelector("img");
  if (band === null || !picture) {
    throw new Error("the band drew no picture");
  }
  return {
    height: band.getBoundingClientRect().height,
    picture: getComputedStyle(picture).opacity,
    fade: getComputedStyle(band).maskImage,
  };
}

beforeEach(async () => {
  mockConvertFileSrc("linux");
  document.documentElement.dataset.theme = "light";
  await page.viewport(PHONE.width, PHONE.height);
});

afterEach(() => {
  clearMocks();
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("lays Android's band as a pale 176px wash that fades out with the cover at 30%", async () => {
  const band = await bandOn("android");

  expect(band.height).toBe(176);
  expect(band.picture).toBe("0.3");
  expect(band.fade).toContain("linear-gradient");
});

test("keeps the 240px full-strength band on an iPhone", async () => {
  const band = await bandOn("ios");

  expect([band.height, band.picture, band.fade]).toEqual([240, "1", "none"]);
});

test("keeps the 240px full-strength band on an Android tablet", async () => {
  await page.viewport(TABLET.width, TABLET.height);

  const band = await bandOn("android");

  expect([band.height, band.picture, band.fade]).toEqual([240, "1", "none"]);
});
