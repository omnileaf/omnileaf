import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { historyEntryLook } from "./history-entry-look.ts";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const PHONE_TRACK = 120;
const TODAYS_TRACK = 56;

async function trackWidthOn(screen: {
  width: number;
  height: number;
}): Promise<number> {
  followCorePlatform("android");
  await page.viewport(screen.width, screen.height);
  const track = document.createElement("div");
  track.className = historyEntryLook("android").bar;
  document.body.append(track);
  return track.getBoundingClientRect().width;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("draws Android's History progress track 120 wide on a phone", async () => {
  expect(await trackWidthOn(PHONE)).toBe(PHONE_TRACK);
});

test("keeps Android's History progress track as it was on a tablet", async () => {
  expect(await trackWidthOn(TABLET)).toBe(TODAYS_TRACK);
});
