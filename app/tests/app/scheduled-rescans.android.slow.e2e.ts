import { execFile } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { afterAll, beforeAll, expect, test } from "vitest";

import {
  mainNavigationLink,
  openLibraryPage,
  useAppSession,
} from "./app-session.ts";
import { createSampleLibrary } from "./sample-library.ts";
import { type Locator, xpath } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const ADDED_SERIES = "Series Added While Saving Power";
const ADDED_BOOK = "Chapter 01";
const SAMPLE_PAGE = join("Sample Series 03", "Chapter 01", "001.png");
const PUSHED_PAGE = "/data/local/tmp/omnileaf-e2e-page.png";
const SCHEDULE_CHECK_EVERY_MS = 60_000;
const RESCAN_EVERY_MS = 5 * 60_000;
const CHECK_MARGIN_MS = 15_000;
const RESUME_TIMEOUT_MS = 2 * SCHEDULE_CHECK_EVERY_MS + CHECK_MARGIN_MS;
const ADB_TIMEOUT_MS = 30_000;
const READ_PAGE_EVERY_MS = 20_000;
const STAY_AWAKE_SETTING = "stay_on_while_plugged_in";
const TEST_TIMEOUT_MS = 15 * 60_000;
const SCHEDULED_CHECKS_LABEL =
  "Check folders for new books while Omnileaf is open";

const SCHEDULED_CHECKS_SWITCH = `//main//button[@role='switch'][.//*[normalize-space()="${SCHEDULED_CHECKS_LABEL}"]]`;
const ADDED_SERIES_TITLE = xpath(
  `//main//*[normalize-space()='${ADDED_SERIES}']`,
);
const LIBRARY_PAGE = xpath("//main");

const run = promisify(execFile);

const appSession = useAppSession();

async function adbShell(command: string): Promise<void> {
  await run("adb", ["shell", command], { timeout: ADB_TIMEOUT_MS });
}

async function setBatterySaver(isOn: boolean): Promise<void> {
  await adbShell(`settings put global low_power ${isOn ? "1" : "0"}`);
}

function settingsRow(label: string): Locator {
  return xpath(
    `//main//a[not(ancestor::nav)][starts-with(normalize-space(), '${label}')]`,
  );
}

function scheduledChecksSwitch(isOn: boolean): Locator {
  return xpath(`${SCHEDULED_CHECKS_SWITCH}[@aria-checked='${String(isOn)}']`);
}

async function open(link: Locator): Promise<void> {
  await (await appSession().waitFor(link)).click();
}

async function isScheduledChecksSwitchOn(): Promise<boolean> {
  await appSession().waitFor(xpath(SCHEDULED_CHECKS_SWITCH));
  const isOn = await appSession().run(
    `return document.evaluate(${JSON.stringify(`boolean(${SCHEDULED_CHECKS_SWITCH}[@aria-checked='true'])`)}, document, null, XPathResult.BOOLEAN_TYPE, null).booleanValue;`,
  );
  return isOn === true;
}

/** Opens a main section and waits until the navigation marks it current, so nothing found afterwards belongs to the page before. */
async function openSection(name: string): Promise<void> {
  await open(mainNavigationLink(name));
  await appSession().waitFor(
    xpath(`${mainNavigationLink(name).value}[@aria-current='page']`),
  );
}

async function turnScheduledChecks(isOn: boolean): Promise<void> {
  await openSection("Settings");
  await open(settingsRow("Advanced"));
  if ((await isScheduledChecksSwitchOn()) !== isOn) {
    await open(xpath(SCHEDULED_CHECKS_SWITCH));
  }
  await appSession().waitFor(scheduledChecksSwitch(isOn));
  await openLibraryPage(appSession());
}

async function removeAddedSeries(): Promise<void> {
  await adbShell(`run-as ${APP_ID} rm -rf "${ADDED_SERIES}"`);
}

/** Writes a book of one sample page into the home folder, the app's own data folder that only `run-as` can reach. */
async function addOnePageBook(sample: string): Promise<void> {
  await run("adb", ["push", join(sample, SAMPLE_PAGE), PUSHED_PAGE], {
    timeout: ADB_TIMEOUT_MS,
  });
  const book = `${ADDED_SERIES}/${ADDED_BOOK}`;
  await adbShell(
    `run-as ${APP_ID} sh -c 'mkdir -p "${book}" && cat > "${book}/001.png"' < ${PUSHED_PAGE}`,
  );
}

/** Reads the library page every few seconds for `durationMs`, which also keeps Appium from ending a session that goes quiet for a minute. */
async function libraryPageFor(durationMs: number): Promise<string[]> {
  const shown: string[] = [];
  const until = performance.now() + durationMs;
  while (performance.now() < until) {
    shown.push(await (await appSession().waitFor(LIBRARY_PAGE)).text());
    await delay(READ_PAGE_EVERY_MS);
  }
  return shown;
}

let stayAwakeBefore = "0";

/** Keeps the screen on while the battery reads as unplugged, since a locked phone sends the app to the background, then unplugs it, since Android turns Battery Saver off while charging, and reloads so the launch rescan drops a series an earlier run left. */
beforeAll(async () => {
  stayAwakeBefore = (
    await run(
      "adb",
      ["shell", "settings", "get", "global", STAY_AWAKE_SETTING],
      {
        timeout: ADB_TIMEOUT_MS,
      },
    )
  ).stdout.trim();
  await adbShell("svc power stayon true");
  await adbShell("dumpsys battery unplug");
  await setBatterySaver(false);
  await removeAddedSeries();
  await appSession().reload();
  await openLibraryPage(appSession());
});

/** Puts the device back as it was, running every step even when one fails, so a failed run doesn't leave Battery Saver on or the battery unplugged. */
afterAll(async () => {
  const steps = [
    () => setBatterySaver(false),
    () => adbShell("dumpsys battery reset"),
    () =>
      adbShell(`settings put global ${STAY_AWAKE_SETTING} ${stayAwakeBefore}`),
    () => adbShell(`rm -f ${PUSHED_PAGE}`),
    removeAddedSeries,
    () => turnScheduledChecks(false),
  ];
  const failures: unknown[] = [];
  for (const step of steps) {
    await step().catch((error: unknown) => {
      failures.push(error);
    });
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "put the device back after the spec");
  }
});

test(
  "starts no scheduled rescan while Battery Saver is on and resumes once it's off",
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const sample = await createSampleLibrary();
    try {
      await turnScheduledChecks(true);
      await libraryPageFor(SCHEDULE_CHECK_EVERY_MS + CHECK_MARGIN_MS);
      await setBatterySaver(true);
      await addOnePageBook(sample.folder);

      const whileSaving = await libraryPageFor(
        RESCAN_EVERY_MS + SCHEDULE_CHECK_EVERY_MS + CHECK_MARGIN_MS,
      );
      await setBatterySaver(false);
      const afterSaving = await (
        await appSession().waitFor(ADDED_SERIES_TITLE, RESUME_TIMEOUT_MS)
      ).text();

      expect(whileSaving.filter((page) => page.includes(ADDED_SERIES))).toEqual(
        [],
      );
      expect(afterSaving).toBe(ADDED_SERIES);
    } finally {
      await sample.remove();
    }
  },
);
