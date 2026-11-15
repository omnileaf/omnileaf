import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";

import "../../app.css";

import { followCorePlatform } from "#lib/page/platform.ts";

import { historyEntryLook } from "./history-entry-look.ts";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const TODAYS_TRACK = 56;

async function trackWidthOn(screen: {
  width: number;
  height: number;
}): Promise<number> {
  followCorePlatform("android");
  await page.viewport(screen.width, screen.height);
  const track = document.createElement("div");
  track.className = historyEntryLook(
    "android",
    screen.width < TABLET.width ? "compact" : "medium",
  ).bar;
  document.body.append(track);
  return track.getBoundingClientRect().width;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test("draws Android's History progress track across its whole column on a phone", async () => {
  expect(await trackWidthOn(PHONE)).toBe(document.body.clientWidth);
});

test("keeps Android's History progress track as it was on a tablet", async () => {
  expect(await trackWidthOn(TABLET)).toBe(TODAYS_TRACK);
});

test("keeps finished books' bars and the split track on an Android tablet", () => {
  const look = historyEntryLook("android", "medium");

  expect([look.showsFinishedBar, look.barTrack]).toEqual([true, "split"]);
});

test("leaves finished books without a bar on an Android phone, in one continuous track", () => {
  const look = historyEntryLook("android", "compact");

  expect([look.showsFinishedBar, look.barTrack]).toEqual([false, "continuous"]);
});
