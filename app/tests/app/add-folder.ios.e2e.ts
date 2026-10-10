import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeAll, expect, inject, test } from "vitest";

import {
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import { SAMPLE_LIBRARY, writeSampleLibrary } from "./sample-library.ts";
import { type Session, xpath } from "./webdriver.ts";

const FILES_APP = "com.apple.DocumentsApp";
const ON_MY_DEVICE_GROUP = "group.com.apple.FileProvider.LocalStorage";
const ON_MY_DEVICE_FOLDER = "File Provider Storage";
const SIMCTL_TIMEOUT_MS = 30_000;
const PICKER_TIMEOUT_MS = 20_000;
const SCAN_TIMEOUT_MS = 60_000;
const LEFT_OPEN_TIMEOUT_MS = 1_000;
const PICKER_TEST_TIMEOUT_MS = 180_000;

const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const READY_ADD_FOLDER_BUTTON = xpath(
  "//button[normalize-space()='Add a folder'][not(@disabled)]",
);
const FINISHED_SCAN_REPORT = xpath(
  "//*[@role='status'][starts-with(normalize-space(), 'Found ')]",
);
const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[normalize-space()='Library']");
const RESCAN_SAMPLE_LIBRARY = xpath(
  `//button[@aria-label='Rescan ${SAMPLE_LIBRARY.name}']`,
);
const UP_TO_DATE_REPORT = xpath(
  `//*[@role='status']/p[normalize-space()='${SAMPLE_LIBRARY.name} is up to date.']`,
);

const BROWSE_TAB = xpath("//XCUIElementTypeButton[@name='Browse']");
const ON_MY_DEVICE = xpath(
  "//*[self::XCUIElementTypeCell or self::XCUIElementTypeButton][@label='On My iPhone' or @label='On My iPad']",
);
const SAMPLE_LIBRARY_FOLDER = xpath(
  `//XCUIElementTypeCell[starts-with(@name, '${SAMPLE_LIBRARY.name},')]`,
);
const OPEN_BUTTON = xpath("//XCUIElementTypeButton[@name='Open']");
const RECENT_TAB = xpath(
  "//XCUIElementTypeButton[@name='Recent' or @name='Recents']",
);
const CANCEL_BUTTON = xpath("//XCUIElementTypeButton[@name='Cancel']");

const SCAN_REPORT = `Found ${String(SAMPLE_LIBRARY.books)} books in ${String(SAMPLE_LIBRARY.series)} series in ${SAMPLE_LIBRARY.name}.`;

const run = promisify(execFile);

const appSession = useAppSession();

function capability(name: string): string {
  const value = inject("appUnderTest").capabilities[name];
  if (typeof value !== "string") {
    throw new Error(`the iOS session has no ${name}`);
  }
  return value;
}

/** Finds where the Simulator keeps On My iPhone, which the Files app only lists as a group container. */
async function onMyDeviceFolder(): Promise<string> {
  const { stdout } = await run(
    "xcrun",
    [
      "simctl",
      "get_app_container",
      capability("appium:udid"),
      FILES_APP,
      "groups",
    ],
    { timeout: SIMCTL_TIMEOUT_MS },
  );
  const group = stdout
    .split("\n")
    .map((line) => line.split("\t"))
    .find(([identifier]) => identifier === ON_MY_DEVICE_GROUP)?.[1];
  if (group === undefined) {
    throw new Error("the Simulator has no On My iPhone storage");
  }
  return join(group.trim(), ON_MY_DEVICE_FOLDER);
}

/** Walks the Files picker to the sample library from wherever it opens, since it reopens where it was last left. */
async function pickSampleLibrary(session: Session): Promise<void> {
  await session.inNativeContext(async () => {
    await (await session.waitFor(BROWSE_TAB, PICKER_TIMEOUT_MS)).click();
    await (await session.waitFor(ON_MY_DEVICE, PICKER_TIMEOUT_MS)).click();
    await (
      await session.waitFor(SAMPLE_LIBRARY_FOLDER, PICKER_TIMEOUT_MS)
    ).click();
    await (await session.waitFor(OPEN_BUTTON, PICKER_TIMEOUT_MS)).click();
  });
}

/** Leaves for the library page first, so re-opening Library settings can't find the page it is replacing. */
async function openLibrarySettings(): Promise<void> {
  await openLibraryPage(appSession());
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(LIBRARY_SETTINGS_LINK)).click();
}

async function addSampleLibrary(): Promise<string> {
  await openLibrarySettings();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await pickSampleLibrary(appSession());
  return (
    await appSession().waitFor(FINISHED_SCAN_REPORT, SCAN_TIMEOUT_MS)
  ).text();
}

/** Closes a picker a failed test left open, so the next test starts on the app's page, not on Files. */
async function closeAnyPicker(session: Session): Promise<void> {
  await session.inNativeContext(async () => {
    try {
      await (await session.waitFor(RECENT_TAB, LEFT_OPEN_TIMEOUT_MS)).click();
    } catch {
      return;
    }
    await (await session.waitFor(CANCEL_BUTTON, PICKER_TIMEOUT_MS)).click();
  });
}

beforeAll(async () => {
  const onMyDevice = await onMyDeviceFolder();
  await rm(join(onMyDevice, SAMPLE_LIBRARY.name), {
    recursive: true,
    force: true,
  });
  await mkdir(onMyDevice, { recursive: true });
  await writeSampleLibrary(onMyDevice);
});

afterEach(async () => {
  await closeAnyPicker(appSession());
});

test(
  "adds a folder picked in Files and reports the series and books in it",
  { timeout: PICKER_TEST_TIMEOUT_MS },
  async () => {
    const report = await addSampleLibrary();

    expect(report).toBe(SCAN_REPORT);
  },
);

test(
  "keeps a folder picked in Files, ready to rescan, once the app has relaunched",
  { timeout: PICKER_TEST_TIMEOUT_MS },
  async () => {
    await addSampleLibrary();

    await appSession().relaunchApp(capability("appium:bundleId"));

    await openLibrarySettings();
    await (await appSession().waitFor(RESCAN_SAMPLE_LIBRARY)).click();
    const report = await appSession().waitFor(
      UP_TO_DATE_REPORT,
      SCAN_TIMEOUT_MS,
    );
    expect(await report.text()).toBe(`${SAMPLE_LIBRARY.name} is up to date.`);
  },
);

test(
  "adds nothing when the Files picker is cancelled",
  { timeout: PICKER_TEST_TIMEOUT_MS },
  async () => {
    await openLibrarySettings();
    await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();

    await appSession().inNativeContext(async () => {
      await (await appSession().waitFor(RECENT_TAB, PICKER_TIMEOUT_MS)).click();
      await (
        await appSession().waitFor(CANCEL_BUTTON, PICKER_TIMEOUT_MS)
      ).click();
    });

    await appSession().waitFor(READY_ADD_FOLDER_BUTTON);
    const reports = appSession().waitFor(FINISHED_SCAN_REPORT, 2_000);
    await expect(reports).rejects.toThrow();
  },
);
