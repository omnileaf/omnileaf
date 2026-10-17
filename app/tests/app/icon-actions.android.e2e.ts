import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { isRecord, listOf } from "./json.ts";
import { pollUntil, xpath } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const APP_WEBVIEW = "WEBVIEW_app.omnileaf";
const MAIN_ACTIVITY = "app.omnileaf/.MainActivity";
const OPEN_ICON_ACTION = "app.omnileaf.OPEN_ICON_ACTION";
const CHOSEN_ICON_ACTION = "app.omnileaf.CHOSEN_ICON_ACTION";
const LAUNCH = "android.intent.action.MAIN";
const LAUNCHER = "android.intent.category.LAUNCHER";
const HOME_KEY = "KEYCODE_HOME";
const NEW_TASK = 0x10000000;
const LAUNCHED_FROM_HISTORY = 0x00100000;
const ADB_TIMEOUT_MS = 30_000;
const PUBLISHED_TIMEOUT_MS = 30_000;
const RESTART_TIMEOUT_MS = 60_000;
const SHORTCUT_LABELS = [
  "Screenshot mode · Off",
  "Continue reading",
  "Search the library",
];
const ON_LIBRARY_SEARCH = "return location.pathname === '/search';";
const SHOWN_PATH = "return location.pathname;";
const TOLD_SCREENSHOT_MODE_CHANGED =
  "return [...document.querySelectorAll('[aria-live], [data-sonner-toast]')].some((element) => /Screenshot mode is (on|off)/.test(element.textContent));";
const MAIN_NAVIGATION = xpath("//nav[@aria-label='Main']");
const TURNED_ON_NOTICE = xpath(
  "//li[@data-sonner-toast][.//*[normalize-space()='Screenshot mode is on']]",
);
const TURN_OFF = xpath(
  "//li[@data-sonner-toast]//button[normalize-space()='Turn off']",
);

const run = promisify(execFile);

const appSession = useAppSession();

async function adb(args: readonly string[]): Promise<string> {
  const { stdout } = await run("adb", args, { timeout: ADB_TIMEOUT_MS });
  return stdout;
}

async function publishedShortcuts(): Promise<string> {
  return adb(["shell", "dumpsys", "shortcut"]);
}

/** Starts the activity as a launcher shortcut does, since where the icon sits and how its menu looks differ from launcher to launcher. */
async function chooseOnTheIcon(
  action: string,
  flags = NEW_TASK,
): Promise<void> {
  await adb([
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    MAIN_ACTIVITY,
    "-f",
    `0x${flags.toString(16)}`,
    "-a",
    OPEN_ICON_ACTION,
    "--es",
    CHOSEN_ICON_ACTION,
    action,
  ]);
}

async function searchAfterAnyEarlierChoice(): Promise<void> {
  await appSession().waitFor(MAIN_NAVIGATION);
  await chooseOnTheIcon("searchLibrary");
  await appSession().waitUntil(ON_LIBRARY_SEARCH, "library search");
}

async function stopTheApp(): Promise<void> {
  await adb(["shell", "am", "force-stop", APP_ID]);
}

async function isRunning(): Promise<boolean> {
  const pids = await adb(["shell", "pidof", APP_ID, "||", "true"]);
  return pids.trim() !== "";
}

/** Android keeps the task and the activity's saved state when it reclaims a backgrounded app's process, as it does when memory runs low. */
async function reclaimTheAppInTheBackground(): Promise<void> {
  await adb(["shell", "input", "keyevent", HOME_KEY]);
  await pollUntil(
    async () => {
      await adb(["shell", "am", "kill", APP_ID]);
      return (await isRunning()) ? undefined : true;
    },
    RESTART_TIMEOUT_MS,
    "the app's process to be reclaimed",
  );
}

async function openFromTheLauncher(): Promise<void> {
  await adb([
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    MAIN_ACTIVITY,
    "-a",
    LAUNCH,
    "-c",
    LAUNCHER,
  ]);
}

async function hasAppPage(): Promise<true | undefined> {
  const webviews = listOf(
    await appSession().runMobileCommand("getContexts", {}),
  );
  const shown = webviews.some(
    (webview) =>
      isRecord(webview) &&
      webview.webviewName === APP_WEBVIEW &&
      listOf(webview.pages).length > 0,
  );
  return shown ? true : undefined;
}

/** Going back to the web view from the native context makes the driver attach to the new process, since the old one's page is gone. */
async function followRestartedApp(): Promise<void> {
  await appSession().inNativeContext(() =>
    pollUntil(hasAppPage, RESTART_TIMEOUT_MS, "the restarted app's web view"),
  );
}

test("publishes Screenshot mode with its state, Continue reading and Search the library", async () => {
  await expect
    .poll(publishedShortcuts, { timeout: PUBLISHED_TIMEOUT_MS })
    .toSatisfy((dump: string) =>
      SHORTCUT_LABELS.every((label) => dump.includes(label)),
    );
});

test("Search the library on the icon opens library search", async () => {
  await chooseOnTheIcon("searchLibrary");

  await appSession().waitUntil(ON_LIBRARY_SEARCH, "library search");

  expect(await appSession().run(SHOWN_PATH)).toBe("/search");
});

test("Screenshot mode on the icon turns it on and says so", async () => {
  await chooseOnTheIcon("screenshotMode");

  const notice = await (await appSession().waitFor(TURNED_ON_NOTICE)).text();
  await (await appSession().waitFor(TURN_OFF)).click();

  expect(notice).toContain("Turns off at");
});

test("reopening from Recents does not choose again the shortcut that first opened the app", async () => {
  await stopTheApp();

  await chooseOnTheIcon("screenshotMode", NEW_TASK | LAUNCHED_FROM_HISTORY);
  await followRestartedApp();
  await searchAfterAnyEarlierChoice();

  expect(await appSession().run(TOLD_SCREENSHOT_MODE_CHANGED)).toBe(false);
});

test("coming back after Android reclaimed the app does not choose again the shortcut that opened it", async () => {
  await stopTheApp();
  await chooseOnTheIcon("screenshotMode");
  await followRestartedApp();
  await appSession().waitUntil(
    TOLD_SCREENSHOT_MODE_CHANGED,
    "Screenshot mode to change",
  );

  await reclaimTheAppInTheBackground();
  await openFromTheLauncher();
  await followRestartedApp();
  await searchAfterAnyEarlierChoice();

  expect(await appSession().run(TOLD_SCREENSHOT_MODE_CHANGED)).toBe(false);
});
