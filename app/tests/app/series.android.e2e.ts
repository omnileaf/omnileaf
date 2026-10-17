import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, test } from "vitest";

import {
  FINISHED_SCAN_REPORT,
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import { createSampleLibrary, SAMPLE_LIBRARY } from "./sample-library.ts";
import { type Locator, xpath } from "./webdriver.ts";

const SHARED_DOCUMENTS = "/sdcard/Documents";
const SAMPLE_ON_DEVICE = `${SHARED_DOCUMENTS}/${SAMPLE_LIBRARY.name}`;
const ADB_TIMEOUT_MS = 30_000;
const PICKER_APPEARS_TIMEOUT_MS = 30_000;
const SCAN_TIMEOUT_MS = 60_000;
const SETUP_TIMEOUT_MS = 180_000;

const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[@href='/settings/library']");
const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");

const DEVICE_STORAGE_CRUMB = xpath(
  "(//*[contains(@resource-id, ':id/breadcrumb_text')])[1]",
);
const PICKER_BUTTON = "//*[@resource-id='android:id/button1']";
const USE_THIS_FOLDER = xpath(
  `${PICKER_BUTTON}[@text='USE THIS FOLDER' or @text='Use this folder']`,
);
const ALLOW = xpath(`${PICKER_BUTTON}[@text='ALLOW' or @text='Allow']`);

const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);
const SERIES_PAGE_HEADING = xpath("//main[.//a[@data-back-link]]//h1");
const FIRST_BOOK = xpath("//ul[@aria-label='Books']/li[1]");
const SCROLL_TO_THE_BOOKS = `const books = document.querySelector("ul[aria-label='Books']");
if (books === null) { return false; }
books.scrollIntoView({ block: "start" });
return true;`;

const run = promisify(execFile);

const appSession = useAppSession();

function pickerFolder(name: string): Locator {
  return xpath(`//*[@resource-id='android:id/title'][@text='${name}']`);
}

async function adb(...args: string[]): Promise<void> {
  await run("adb", args, { timeout: ADB_TIMEOUT_MS });
}

/** Walks the Files picker from the device's own storage, since it reopens where it was last left. */
async function pickSampleLibrary(): Promise<void> {
  const session = appSession();
  await session.inNativeContext(async () => {
    await (
      await session.waitFor(DEVICE_STORAGE_CRUMB, PICKER_APPEARS_TIMEOUT_MS)
    ).click();
    await (await session.waitFor(pickerFolder("Documents"))).click();
    await (await session.waitFor(pickerFolder(SAMPLE_LIBRARY.name))).click();
    await (await session.waitFor(USE_THIS_FOLDER)).click();
    await (await session.waitFor(ALLOW)).click();
  });
}

async function addSampleLibrary(): Promise<void> {
  const session = appSession();
  await (await session.waitFor(SETTINGS_LINK)).click();
  await (await session.waitFor(LIBRARY_SETTINGS_LINK)).click();
  await (await session.waitFor(ADD_FOLDER_BUTTON)).click();
  await pickSampleLibrary();
  await session.waitFor(FINISHED_SCAN_REPORT, SCAN_TIMEOUT_MS);
  await openLibraryPage(session);
}

async function openFirstSeries(): Promise<string> {
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  return (await appSession().waitFor(SERIES_PAGE_HEADING)).text();
}

beforeAll(async () => {
  const sample = await createSampleLibrary();
  try {
    await adb("shell", "rm", "-rf", `'${SAMPLE_ON_DEVICE}'`);
    await adb("push", sample.folder, SHARED_DOCUMENTS);
  } finally {
    await sample.remove();
  }
  await openLibraryPage(appSession());
  await addSampleLibrary();
}, SETUP_TIMEOUT_MS);

afterAll(() => adb("shell", "rm", "-rf", `'${SAMPLE_ON_DEVICE}'`));

test("opens a series of a folder picked in Files on its own page, with its books in order", async () => {
  const heading = await openFirstSeries();

  expect(heading).toBe("Sample Series 01");
  await appSession().waitUntil(
    SCROLL_TO_THE_BOOKS,
    "the books list scrolled into view",
  );
  const first = await appSession().waitFor(FIRST_BOOK);
  expect(await first.text()).toMatch(/^Sample Series 01 v01/);
});
