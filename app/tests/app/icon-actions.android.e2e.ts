import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const MAIN_ACTIVITY = "app.omnileaf/.MainActivity";
const OPEN_ICON_ACTION = "app.omnileaf.OPEN_ICON_ACTION";
const CHOSEN_ICON_ACTION = "app.omnileaf.CHOSEN_ICON_ACTION";
const ADB_TIMEOUT_MS = 30_000;
const PUBLISHED_TIMEOUT_MS = 30_000;
const SHORTCUT_LABELS = [
  "Screenshot mode · Off",
  "Continue reading",
  "Search the library",
];
const ON_LIBRARY_SEARCH = "return location.pathname === '/search';";
const SHOWN_PATH = "return location.pathname;";
const TURNED_ON_NOTICE = xpath(
  "//li[@data-sonner-toast][.//*[normalize-space()='Screenshot mode is on']]",
);
const TURN_OFF = xpath(
  "//li[@data-sonner-toast]//button[normalize-space()='Turn off']",
);

const run = promisify(execFile);

const appSession = useAppSession();

async function publishedShortcuts(): Promise<string> {
  const { stdout } = await run("adb", ["shell", "dumpsys", "shortcut"], {
    timeout: ADB_TIMEOUT_MS,
  });
  return stdout;
}

/** Starts the activity as a launcher shortcut does, since where the icon sits and how its menu looks differ from launcher to launcher. */
async function chooseOnTheIcon(action: string): Promise<void> {
  await run(
    "adb",
    [
      "shell",
      "am",
      "start",
      "-n",
      MAIN_ACTIVITY,
      "-a",
      OPEN_ICON_ACTION,
      "--es",
      CHOSEN_ICON_ACTION,
      action,
    ],
    { timeout: ADB_TIMEOUT_MS },
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
