import { access, rm } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, expect, test } from "vitest";

import { openLibraryPage, useAppSession } from "./app-session.ts";
import {
  appContainer,
  capability,
  copyNewBookInto,
  onMyIphoneOmnileaf,
} from "./ios-app-data.ts";
import { xpath } from "./webdriver.ts";

const LIBRARY_DATABASE = "library.sqlite";
const SCAN_TIMEOUT_MS = 60_000;
const COPIED_BOOK_TEST_TIMEOUT_MS = 180_000;
const COPIED_SERIES = "Copied Series";
const COPIED_SERIES_TITLE = xpath(
  `//main//*[normalize-space()='${COPIED_SERIES}']`,
);

const appSession = useAppSession();

afterAll(async () => {
  await rm(join(await onMyIphoneOmnileaf(), COPIED_SERIES), {
    recursive: true,
    force: true,
  });
});

test("keeps the library database inside the app, out of the folder the Files app shows", async () => {
  const bundleId = capability("appium:bundleId");
  const container = await appContainer();

  const inFiles = join(container, "Documents", LIBRARY_DATABASE);
  const inApp = join(
    container,
    "Library",
    "Application Support",
    bundleId,
    LIBRARY_DATABASE,
  );

  await expect(access(inFiles)).rejects.toThrow();
  await expect(access(inApp)).resolves.toBeUndefined();
});

test(
  "reads a book copied into On My iPhone › Omnileaf once the app relaunches",
  { timeout: COPIED_BOOK_TEST_TIMEOUT_MS },
  async () => {
    const home = await onMyIphoneOmnileaf();
    await rm(join(home, COPIED_SERIES), { recursive: true, force: true });
    await copyNewBookInto(home, COPIED_SERIES);

    await appSession().relaunchApp(capability("appium:bundleId"));
    await openLibraryPage(appSession());

    const series = await appSession().waitFor(
      COPIED_SERIES_TITLE,
      SCAN_TIMEOUT_MS,
    );
    expect(await series.text()).toBe(COPIED_SERIES);
  },
);
