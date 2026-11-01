import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, test } from "vitest";

import {
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import { type Session, xpath } from "./webdriver.ts";

const HOME_FOLDER_NAME = "Omnileaf Home Test";
const HOME_FOLDER_PATH = `/sdcard/Documents/${HOME_FOLDER_NAME}`;
const PICKED_PLACE = `Internal storage › Documents › ${HOME_FOLDER_NAME}`;
const ADB_TIMEOUT_MS = 30_000;
const PICKER_TIMEOUT_MS = 30_000;
const MOVE_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 5 * 60_000;

const SETTINGS_LINK = mainNavigationLink("Settings");
const LIBRARY_SETTINGS_LINK = xpath("//main//a[@href='/settings/library']");
const HOME_FOLDER_ROW = xpath(
  "//main//button[@aria-labelledby][@aria-describedby]",
);
const MOVED_HOME_PLACE = xpath(
  `//main//code[normalize-space()='${PICKED_PLACE}']`,
);
const PICKED_FOLDER = xpath(`//*[@text='${HOME_FOLDER_NAME}']`);
const USE_THIS_FOLDER = xpath(
  "//*[@text='Use this folder' or @text='USE THIS FOLDER']",
);
const ALLOW_ACCESS = xpath("//*[@resource-id='android:id/button1']");

const run = promisify(execFile);

const appSession = useAppSession();

async function adbShell(command: string): Promise<void> {
  await run("adb", ["shell", command], { timeout: ADB_TIMEOUT_MS });
}

/** Android's folder picker opens in Documents, where it lists the folder and asks for the grant before it hands the tree back. */
async function pickHomeFolder(session: Session): Promise<void> {
  await session.inNativeContext(async () => {
    await (await session.waitFor(PICKED_FOLDER, PICKER_TIMEOUT_MS)).click();
    await (await session.waitFor(USE_THIS_FOLDER, PICKER_TIMEOUT_MS)).click();
    await (await session.waitFor(ALLOW_ACCESS, PICKER_TIMEOUT_MS)).click();
  });
}

async function openLibrarySettings(): Promise<void> {
  await openLibraryPage(appSession());
  await (await appSession().waitFor(SETTINGS_LINK)).click();
  await (await appSession().waitFor(LIBRARY_SETTINGS_LINK)).click();
}

beforeAll(async () => {
  await adbShell(`rm -rf '${HOME_FOLDER_PATH}'`);
  await adbShell(`mkdir -p '${HOME_FOLDER_PATH}'`);
});

afterAll(async () => {
  await adbShell(`rm -rf '${HOME_FOLDER_PATH}'`);
});

test(
  "picks the home folder through the picker",
  async () => {
    await openLibrarySettings();

    await (await appSession().waitFor(HOME_FOLDER_ROW)).click();
    await pickHomeFolder(appSession());

    const moved = await appSession().waitFor(MOVED_HOME_PLACE, MOVE_TIMEOUT_MS);
    expect(await moved.text()).toBe(PICKED_PLACE);
  },
  TEST_TIMEOUT_MS,
);
