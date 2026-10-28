import { rm } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, expect, test } from "vitest";

import { openLibraryPage, useAppSession } from "./app-session.ts";
import {
  capability,
  copyNewBookInto,
  onMyIphoneOmnileaf,
} from "./ios-app-data.ts";
import { xpath } from "./webdriver.ts";

const EDGE_X = 0;
const SWIPE_Y = 420;
const RELEASE_X = 320;
const NO_PAUSE_SECONDS = 0;
const FINGER_POINTS_PER_SECOND = 600;
const SCAN_TIMEOUT_MS = 60_000;
const SWIPE_TEST_TIMEOUT_MS = 180_000;

const SWIPED_SERIES = "Swiped Series";
const SWIPED_SERIES_TITLE = xpath(
  `//main//*[normalize-space()='${SWIPED_SERIES}']`,
);
const FIRST_BOOK = xpath("//ul[@aria-label='Books']//a");
const NEXT_PAGE = xpath("//button[@aria-label='Next page']");
const PAGE_HEADING = xpath("//main//h1");
const ON_A_SERIES_PAGE = "return location.pathname.startsWith('/series/');";

const appSession = useAppSession();

beforeAll(async () => {
  const home = await onMyIphoneOmnileaf();
  await rm(join(home, SWIPED_SERIES), { recursive: true, force: true });
  await copyNewBookInto(home, SWIPED_SERIES);
  await appSession().relaunchApp(capability("appium:bundleId"));
});

afterAll(async () => {
  await rm(join(await onMyIphoneOmnileaf(), SWIPED_SERIES), {
    recursive: true,
    force: true,
  });
});

test(
  "goes back from the reader to the series on a swipe from the left edge",
  { timeout: SWIPE_TEST_TIMEOUT_MS },
  async () => {
    await openLibraryPage(appSession());
    await (
      await appSession().waitFor(SWIPED_SERIES_TITLE, SCAN_TIMEOUT_MS)
    ).click();
    await appSession().waitUntil(ON_A_SERIES_PAGE, "the series page");
    await (await appSession().waitFor(FIRST_BOOK)).click();
    await appSession().waitFor(NEXT_PAGE);

    await appSession().runMobileCommand("dragFromToWithVelocity", {
      pressDuration: NO_PAUSE_SECONDS,
      holdDuration: NO_PAUSE_SECONDS,
      velocity: FINGER_POINTS_PER_SECOND,
      fromX: EDGE_X,
      fromY: SWIPE_Y,
      toX: RELEASE_X,
      toY: SWIPE_Y,
    });

    await appSession().waitUntil(ON_A_SERIES_PAGE, "back on the series page");
    const heading = await appSession().waitFor(PAGE_HEADING);
    expect(await heading.text()).toBe(SWIPED_SERIES);
  },
);
