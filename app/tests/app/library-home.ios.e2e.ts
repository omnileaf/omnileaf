import { execFile } from "node:child_process";
import { access, cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterAll, expect, inject, test } from "vitest";

import { openLibraryPage, useAppSession } from "./app-session.ts";
import { createSampleLibrary } from "./sample-library.ts";
import { xpath } from "./webdriver.ts";

const LIBRARY_DATABASE = "library.sqlite";
const SIMCTL_TIMEOUT_MS = 30_000;
const SCAN_TIMEOUT_MS = 60_000;
const COPIED_BOOK_TEST_TIMEOUT_MS = 180_000;
const SAMPLE_CHAPTER = join("Sample Series 03", "Chapter 01");
const COPIED_SERIES = "Copied Series";
const COPIED_SERIES_TITLE = xpath(
  `//main//*[normalize-space()='${COPIED_SERIES}']`,
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

async function appContainer(): Promise<string> {
  const { stdout } = await run(
    "xcrun",
    [
      "simctl",
      "get_app_container",
      capability("appium:udid"),
      capability("appium:bundleId"),
      "data",
    ],
    { timeout: SIMCTL_TIMEOUT_MS },
  );
  return stdout.trim();
}

/** The app's folder that the Files app shows as On My iPhone › Omnileaf. */
async function onMyIphoneOmnileaf(): Promise<string> {
  return join(await appContainer(), "Documents");
}

/** Copies all but the last page of a sample chapter, so the copy is a book of its own rather than the sample one again. */
async function copyNewBookInto(folder: string): Promise<void> {
  const sample = await createSampleLibrary();
  try {
    const chapter = join(sample.folder, SAMPLE_CHAPTER);
    const pages = (await readdir(chapter)).toSorted().slice(0, -1);
    const copied = join(folder, COPIED_SERIES, "Chapter 01");
    await mkdir(copied, { recursive: true });
    for (const page of pages) {
      await cp(join(chapter, page), join(copied, page));
    }
  } finally {
    await sample.remove();
  }
}

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
    await copyNewBookInto(home);

    await appSession().relaunchApp(capability("appium:bundleId"));
    await openLibraryPage(appSession());

    const series = await appSession().waitFor(
      COPIED_SERIES_TITLE,
      SCAN_TIMEOUT_MS,
    );
    expect(await series.text()).toBe(COPIED_SERIES);
  },
);
