import { afterAll, beforeAll, expect, test } from "vitest";

import { ANDROID_APP_ID, adbShell } from "./android-settings.ts";
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
const RIGHT_TO_LEFT_LANGUAGE = "ar";

const appSession = useAppSession();

let appLanguagesBefore: string | undefined;

beforeAll(async () => {
  appLanguagesBefore = await appLanguages();
});

afterAll(async () => {
  if (appLanguagesBefore !== undefined) {
    await setAppLanguages(appLanguagesBefore);
  }
});

async function pressBack(): Promise<void> {
  await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });
}

async function newWindow(
  known: readonly string[],
): Promise<string | undefined> {
  const windows = await appSession().windows();
  return windows.find((handle) => !known.includes(handle));
}

async function localeCommand(...args: readonly string[]): Promise<string> {
  return adbShell("cmd", "locale", ...args);
}

async function appLanguages(): Promise<string> {
  const listed = await localeCommand("get-app-locales", ANDROID_APP_ID);
  return /\[(.*)\]/.exec(listed)?.[1] ?? "";
}

async function setAppLanguages(languages: string): Promise<void> {
  await localeCommand(
    "set-app-locales",
    ANDROID_APP_ID,
    ...(languages === "" ? [] : ["--locales", languages]),
  );
}

/** Android recreates the activity, with a new web view, when an app language turns the layout right to left. */
async function recreateTheScreenWithAppLanguages(
  languages: string,
): Promise<void> {
  const known = await appSession().windows();
  await setAppLanguages(languages);
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
  await recreateTheScreenWithAppLanguages(RIGHT_TO_LEFT_LANGUAGE);
  await recreateTheScreenWithAppLanguages(appLanguagesBefore ?? "");
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("About"));
  await shownPage(appSession(), "About");

  await pressBack();

  expect(await shownPage(appSession(), "Settings")).toBe("Settings");
});
