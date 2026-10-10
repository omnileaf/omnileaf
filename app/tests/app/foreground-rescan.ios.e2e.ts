import { execFile } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, inject, test } from "vitest";

import { openLibraryPage, useAppSession } from "./app-session.ts";
import { createSampleLibrary } from "./sample-library.ts";
import { xpath } from "./webdriver.ts";

const ADDED_SERIES = "Series Added While Away";
const SAMPLE_PAGE = join("Sample Series 03", "Chapter 01", "001.png");
const ADDED_BOOK = "Chapter 01";
const SIMCTL_TIMEOUT_MS = 30_000;
const RESCAN_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 180_000;
const STAYS_IN_THE_BACKGROUND = -1;

/** The webview reports the app leaving under a second after it has, and not at all for a trip shorter than that. */
const PAGE_SEES_THE_APP_AWAY = `return document.visibilityState === "hidden";`;

const ADDED_SERIES_TITLE = xpath(
  `//main//*[normalize-space()='${ADDED_SERIES}']`,
);

const run = promisify(execFile);

const appSession = useAppSession();

function capability(name: string): string {
  const value = inject("appUnderTest").capabilities[name];
  if (typeof value !== "string") {
    throw new Error(`the iOS session has no ${name}`);
  }
  return value;
}

/** The library's home folder, which the app keeps in its Application Support folder beside the library database. */
async function homeFolder(): Promise<string> {
  const bundleId = capability("appium:bundleId");
  const { stdout } = await run(
    "xcrun",
    [
      "simctl",
      "get_app_container",
      capability("appium:udid"),
      bundleId,
      "data",
    ],
    { timeout: SIMCTL_TIMEOUT_MS },
  );
  return join(stdout.trim(), "Library", "Application Support", bundleId);
}

async function removeAddedSeries(): Promise<void> {
  await rm(join(await homeFolder(), ADDED_SERIES), {
    recursive: true,
    force: true,
  });
}

/** Writes a book of one sample page, since the library files a copy of a book it already holds under that book's own series. */
async function addOnePageBook(sample: string, series: string): Promise<void> {
  const book = join(series, ADDED_BOOK);
  await mkdir(book, { recursive: true });
  await cp(join(sample, SAMPLE_PAGE), join(book, "001.png"));
}

/** Removes a series an earlier run left, relaunching so the launch rescan takes it out of the library too. */
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
    const home = await homeFolder();
    const sample = await createSampleLibrary();
    try {
      await appSession().runMobileCommand("backgroundApp", {
        seconds: STAYS_IN_THE_BACKGROUND,
      });
      await appSession().waitUntil(
        PAGE_SEES_THE_APP_AWAY,
        "the page to see the app leave the screen",
      );
      await addOnePageBook(sample.folder, join(home, ADDED_SERIES));

      await appSession().runMobileCommand("activateApp", {
        bundleId: capability("appium:bundleId"),
      });

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
