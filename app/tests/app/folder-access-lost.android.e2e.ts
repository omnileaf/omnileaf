import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import {
  addSampleLibraryFromFiles,
  SAMPLE_ON_DEVICE,
  SHARED_DOCUMENTS,
  putSampleLibraryOnTheDevice,
  removeSampleLibraryFromTheDevice,
} from "./files-sample-library.ts";
import { SAMPLE_LIBRARY } from "./sample-library.ts";
import { pollUntil, xpath } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const MOVED_AWAY = `${SHARED_DOCUMENTS}/${SAMPLE_LIBRARY.name} moved away`;
const ADB_TIMEOUT_MS = 30_000;
const SETUP_TIMEOUT_MS = 180_000;
const TEST_TIMEOUT_MS = 180_000;
const NOTICE_TIMEOUT_MS = 60_000;
const LEAVE_SCREEN_TIMEOUT_MS = 30_000;
const STAYS_IN_THE_BACKGROUND = -1;
const IN_THE_BACKGROUND = 3;

const NEEDS_ATTENTION = xpath(
  "//main//button[starts-with(@aria-label, 'Needs attention')]",
);
const CANT_OPEN = xpath(
  `//*[@role='dialog']//*[normalize-space()='Omnileaf can’t open ${SAMPLE_LIBRARY.name}']`,
);
const CHOOSE_IT_AGAIN = xpath(
  "//*[@role='dialog']//button[normalize-space()='Choose it again']",
);

const run = promisify(execFile);

const appSession = useAppSession();

async function adbShell(command: string): Promise<void> {
  await run("adb", ["shell", command], { timeout: ADB_TIMEOUT_MS });
}

async function isInBackground(): Promise<true | undefined> {
  const state = await appSession().runMobileCommand("queryAppState", {
    appId: APP_ID,
  });
  return state === IN_THE_BACKGROUND ? true : undefined;
}

async function putAppInTheBackgroundAndBack(): Promise<void> {
  await appSession().runMobileCommand("backgroundApp", {
    seconds: STAYS_IN_THE_BACKGROUND,
  });
  await pollUntil(
    isInBackground,
    LEAVE_SCREEN_TIMEOUT_MS,
    "the app in the background",
  );
  await appSession().runMobileCommand("activateApp", { appId: APP_ID });
}

beforeAll(async () => {
  await adbShell(`rm -rf '${MOVED_AWAY}'`);
  await putSampleLibraryOnTheDevice();
  await addSampleLibraryFromFiles(appSession());
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  await adbShell(`rm -rf '${MOVED_AWAY}'`);
  await removeSampleLibraryFromTheDevice();
});

test(
  "lists a linked folder Android no longer lets Omnileaf open under Needs attention, with Choose it again",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    await adbShell(`mv '${SAMPLE_ON_DEVICE}' '${MOVED_AWAY}'`);

    await putAppInTheBackgroundAndBack();

    await (
      await appSession().waitFor(NEEDS_ATTENTION, NOTICE_TIMEOUT_MS)
    ).click();

    await appSession().waitFor(CANT_OPEN);
    await appSession().waitFor(CHOOSE_IT_AGAIN);
  },
);
