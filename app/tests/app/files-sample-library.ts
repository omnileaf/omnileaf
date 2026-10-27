import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  FINISHED_SCAN_REPORT,
  mainNavigationLink,
  openLibraryPage,
} from "./app-session.ts";
import { createSampleLibrary, SAMPLE_LIBRARY } from "./sample-library.ts";
import { type Locator, type Session, xpath } from "./webdriver.ts";

const SHARED_DOCUMENTS = "/sdcard/Documents";
const SAMPLE_ON_DEVICE = `${SHARED_DOCUMENTS}/${SAMPLE_LIBRARY.name}`;
const ADB_TIMEOUT_MS = 30_000;
const PICKER_APPEARS_TIMEOUT_MS = 30_000;
const SCAN_TIMEOUT_MS = 60_000;

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

const run = promisify(execFile);

async function adb(...args: string[]): Promise<void> {
  await run("adb", args, { timeout: ADB_TIMEOUT_MS });
}

function pickerFolder(name: string): Locator {
  return xpath(`//*[@resource-id='android:id/title'][@text='${name}']`);
}

export async function removeSampleLibraryFromTheDevice(): Promise<void> {
  await adb("shell", "rm", "-rf", `'${SAMPLE_ON_DEVICE}'`);
}

export async function putSampleLibraryOnTheDevice(): Promise<void> {
  const sample = await createSampleLibrary();
  try {
    await removeSampleLibraryFromTheDevice();
    await adb("push", sample.folder, SHARED_DOCUMENTS);
  } finally {
    await sample.remove();
  }
}

/** Walks the Files picker from the device's own storage, since it reopens where it was last left. */
async function pickSampleLibrary(session: Session): Promise<void> {
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

export async function addSampleLibraryFromFiles(
  session: Session,
): Promise<void> {
  await openLibraryPage(session);
  await (await session.waitFor(SETTINGS_LINK)).click();
  await (await session.waitFor(LIBRARY_SETTINGS_LINK)).click();
  await (await session.waitFor(ADD_FOLDER_BUTTON)).click();
  await pickSampleLibrary(session);
  await session.waitFor(FINISHED_SCAN_REPORT, SCAN_TIMEOUT_MS);
  await openLibraryPage(session);
}
