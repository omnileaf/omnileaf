import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";

import "../../app.css";

import type { WidthClass } from "#lib/page/breakpoints.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import { historyEntryLook } from "./history-entry-look.ts";

interface Screen {
  readonly width: number;
  readonly height: number;
  readonly widthClass: WidthClass;
}

const PHONE: Screen = { width: 390, height: 844, widthClass: "compact" };
const TABLET: Screen = { width: 820, height: 1180, widthClass: "medium" };

async function trackWidthOn(screen: Screen): Promise<number> {
  followCorePlatform("android");
  await page.viewport(screen.width, screen.height);
  const track = document.createElement("div");
  track.className = historyEntryLook("android", screen.widthClass).bar;
  document.body.append(track);
  return track.getBoundingClientRect().width;
}

afterEach(() => {
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test.each([PHONE, TABLET])(
  "draws Android's History progress track across its whole column at $width wide",
  async (screen) => {
    expect(await trackWidthOn(screen)).toBe(document.body.clientWidth);
  },
);

test.each([PHONE.widthClass, TABLET.widthClass])(
  "leaves finished books without a bar on a $0 Android screen, in one continuous track",
  (widthClass) => {
    const look = historyEntryLook("android", widthClass);

    expect([look.showsFinishedBar, look.barTrack]).toEqual([
      false,
      "continuous",
    ]);
  },
);

test("keeps an iPhone's finished books' bars on the split track", () => {
  const look = historyEntryLook("ios", PHONE.widthClass);

  expect([look.showsFinishedBar, look.barTrack]).toEqual([true, "split"]);
});
