import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, expect, onTestFinished, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { type Locator, pollUntil, xpath } from "./webdriver.ts";

const APP_ID = "app.omnileaf";
const BACK_KEY = 4;
const RUNNING_IN_FOREGROUND = 4;
const NEW_SCREEN_TIMEOUT_MS = 30_000;
const ADB_TIMEOUT_MS = 30_000;
const DEFAULT_FONT_SCALE = "1.0";
const LARGER_FONT_SCALE = "1.15";

const run = promisify(execFile);

const appSession = useAppSession();

afterAll(() => setFontScale(DEFAULT_FONT_SCALE));

function navigationLink(label: string): Locator {
  return xpath(`//nav//a[normalize-space()='${label}']`);
}

function pageLink(label: string): Locator {
  return xpath(`//main//a[normalize-space()='${label}']`);
}

async function open(link: Locator): Promise<void> {
  await (await appSession().waitFor(link)).click();
}

async function pressBack(): Promise<void> {
  await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });
}

async function shownPage(title: string): Promise<string> {
  const heading = await appSession().waitFor(
    xpath(`//main//h1[normalize-space()='${title}']`),
  );
  return heading.text();
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

async function appState(): Promise<unknown> {
  return appSession().runMobileCommand("queryAppState", { appId: APP_ID });
}

test("goes up from a Settings page to Settings and then to Library", async () => {
  await open(navigationLink("Settings"));
  await open(pageLink("Appearance"));
  await shownPage("Appearance");

  await pressBack();
  const upOneLevel = await shownPage("Settings");
  await pressBack();
  const upTwoLevels = await shownPage("Library");

  expect([upOneLevel, upTwoLevels]).toEqual(["Settings", "Library"]);
});

test("goes back to Library from a section opened after another", async () => {
  await open(navigationLink("Browse"));
  await open(navigationLink("History"));
  await shownPage("History");

  await pressBack();

  expect(await shownPage("Library")).toBe("Library");
});

test("keeps back inside the app after Android recreates the activity", async () => {
  await recreateTheScreenWithFontScale(LARGER_FONT_SCALE);
  onTestFinished(() => recreateTheScreenWithFontScale(DEFAULT_FONT_SCALE));
  await open(navigationLink("Settings"));
  await open(pageLink("About"));
  await shownPage("About");

  await pressBack();

  expect(await shownPage("Settings")).toBe("Settings");
});

test("leaves the app from Library", async () => {
  await shownPage("Library");

  await pressBack();

  await expect.poll(appState).not.toBe(RUNNING_IN_FOREGROUND);
});
