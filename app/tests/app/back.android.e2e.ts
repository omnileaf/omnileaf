import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, expect, onTestFinished, test } from "vitest";

import {
  clickWhenShown,
  mainNavigationLink,
  settingsRow,
  shownPage,
  useAppSession,
} from "./app-session.ts";
import { pollUntil } from "./webdriver.ts";

const BACK_KEY = 4;
const NEW_SCREEN_TIMEOUT_MS = 30_000;
const ADB_TIMEOUT_MS = 30_000;
const DEFAULT_FONT_SCALE = "1.0";
const LARGER_FONT_SCALE = "1.15";

const run = promisify(execFile);

const appSession = useAppSession();

afterAll(() => setFontScale(DEFAULT_FONT_SCALE));

async function pressBack(): Promise<void> {
  await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });
}

async function newWindow(
  known: readonly string[],
): Promise<string | undefined> {
  const windows = await appSession().windows();
  return windows.find((handle) => !known.includes(handle));
}

async function setFontScale(scale: string): Promise<void> {
  await run(
    "adb",
    ["shell", "settings", "put", "system", "font_scale", scale],
    {
      timeout: ADB_TIMEOUT_MS,
    },
  );
}

/** Changes the text size, which Android answers by recreating the activity with a new web view. */
async function recreateTheScreenWithFontScale(scale: string): Promise<void> {
  const known = await appSession().windows();
  await setFontScale(scale);
  const created = await pollUntil(
    () => newWindow(known),
    NEW_SCREEN_TIMEOUT_MS,
    "the recreated activity's web view",
  );
  await appSession().switchToWindow(created);
}

test("goes up from a Settings page to Settings and then to Library", async () => {
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("Appearance"));
  await shownPage(appSession(), "Appearance");

  await pressBack();
  const upOneLevel = await shownPage(appSession(), "Settings");
  await pressBack();
  const upTwoLevels = await shownPage(appSession(), "Library");

  expect([upOneLevel, upTwoLevels]).toEqual(["Settings", "Library"]);
});

test("goes back to Library from a section opened after another", async () => {
  await clickWhenShown(appSession(), mainNavigationLink("Browse"));
  await clickWhenShown(appSession(), mainNavigationLink("History"));
  await shownPage(appSession(), "History");

  await pressBack();

  expect(await shownPage(appSession(), "Library")).toBe("Library");
});

test("keeps back inside the app after Android recreates the activity", async () => {
  await recreateTheScreenWithFontScale(LARGER_FONT_SCALE);
  onTestFinished(() => recreateTheScreenWithFontScale(DEFAULT_FONT_SCALE));
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("About"));
  await shownPage(appSession(), "About");

  await pressBack();

  expect(await shownPage(appSession(), "Settings")).toBe("Settings");
});
