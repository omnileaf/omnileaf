import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, expect, test } from "vitest";

import { openLibraryPage, useAppSession } from "./app-session.ts";
import { capability, onMyIphoneOmnileaf } from "./ios-app-data.ts";
import { createSampleLibrary } from "./sample-library.ts";
import { pollUntil, xpath } from "./webdriver.ts";

const ADDED_SERIES = "Series Added While Away";
const SAMPLE_PAGE = join("Sample Series 03", "Chapter 01", "001.png");
const ADDED_BOOK = "Chapter 01";
const RESCAN_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 180_000;
const STAYS_IN_THE_BACKGROUND = -1;
const BACKGROUND_APP_STATES: ReadonlySet<unknown> = new Set([2, 3]);
const LEAVE_SCREEN_TIMEOUT_MS = 30_000;

const ADDED_SERIES_TITLE = xpath(
  `//main//*[normalize-space()='${ADDED_SERIES}']`,
);

const appSession = useAppSession();

async function removeAddedSeries(): Promise<void> {
  await rm(join(await onMyIphoneOmnileaf(), ADDED_SERIES), {
    recursive: true,
    force: true,
  });
}

/** Asks the device rather than the page, since a page stops answering scripts once its app leaves the screen. */
async function isInBackground(bundleId: string): Promise<true | undefined> {
  const state = await appSession().runMobileCommand("queryAppState", {
    bundleId,
  });
  return BACKGROUND_APP_STATES.has(state) ? true : undefined;
}

async function addOnePageBook(sample: string, series: string): Promise<void> {
  const book = join(series, ADDED_BOOK);
  await mkdir(book, { recursive: true });
  await cp(join(sample, SAMPLE_PAGE), join(book, "001.png"));
}

beforeAll(async () => {
  await removeAddedSeries();
  await appSession().relaunchApp(capability("appium:bundleId"));
  await openLibraryPage(appSession());
});

afterAll(removeAddedSeries);

test(
  "finds a book added to the home folder while the app was away once it comes back",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const bundleId = capability("appium:bundleId");
    const home = await onMyIphoneOmnileaf();
    const sample = await createSampleLibrary();
    try {
      await appSession().runMobileCommand("backgroundApp", {
        seconds: STAYS_IN_THE_BACKGROUND,
      });
      await pollUntil(
        () => isInBackground(bundleId),
        LEAVE_SCREEN_TIMEOUT_MS,
        "the app in the background",
      );
      await addOnePageBook(sample.folder, join(home, ADDED_SERIES));

      await appSession().runMobileCommand("activateApp", { bundleId });

      const title = await appSession().waitFor(
        ADDED_SERIES_TITLE,
        RESCAN_TIMEOUT_MS,
      );
      expect(await title.text()).toBe(ADDED_SERIES);
    } finally {
      await sample.remove();
    }
  },
);
