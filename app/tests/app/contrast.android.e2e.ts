import { afterAll, beforeAll, expect, test } from "vitest";

import { androidSetting, ANDROID_APP_ID } from "./android-settings.ts";
import {
  clickWhenShown,
  mainNavigationLink,
  settingsRow,
  SHOWN_PATH,
  shownPage,
  useAppSession,
} from "./app-session.ts";
import {
  addSampleLibraryFromFiles,
  putSampleLibraryOnTheDevice,
  removeSampleLibraryFromTheDevice,
} from "./files-sample-library.ts";
import { followRecreatedScreen } from "./recreated-screen.ts";
import {
  FIRST_SERIES_COVER,
  PAGE_COUNTER,
  readSampleBookToPage,
} from "./sample-book.ts";

const SETUP_TIMEOUT_MS = 180_000;
const STANDARD_CONTRAST = "0";
const HIGH_CONTRAST = "1";
const SAMPLE_SERIES = "Sample Series 01";
const SAVED_PAGE = 3;
const BACK_KEY = 4;
const RUNNING_IN_FOREGROUND = 4;

const contrastLevel = androidSetting("secure", "contrast_level");

const appSession = useAppSession();

let contrastBefore: string | undefined;

beforeAll(async () => {
  contrastBefore = await contrastLevel.read();
  await putSampleLibraryOnTheDevice();
  await addSampleLibraryFromFiles(appSession());
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  if (contrastBefore !== undefined) {
    await contrastLevel.restore(contrastBefore);
  }
});

afterAll(removeSampleLibraryFromTheDevice);

function contrastOtherThan(level: string): string {
  return Number(level) >= Number(HIGH_CONTRAST)
    ? STANDARD_CONTRAST
    : HIGH_CONTRAST;
}

/** Android rebuilds the activity, with a new web view, when its Colour contrast changes. */
async function changeTheContrast(): Promise<void> {
  await followRecreatedScreen(appSession(), async () => {
    await contrastLevel.put(contrastOtherThan(await contrastLevel.read()));
  });
}

async function showSampleSeries(): Promise<void> {
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  await shownPage(appSession(), SAMPLE_SERIES);
}

async function openAppearanceSettings(): Promise<void> {
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("Appearance"));
  await shownPage(appSession(), "Appearance");
}

async function pressBack(): Promise<void> {
  await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });
}

async function appState(): Promise<unknown> {
  return appSession().runMobileCommand("queryAppState", {
    appId: ANDROID_APP_ID,
  });
}

test("stays on a Settings page when Android's colour contrast changes", async () => {
  await openAppearanceSettings();

  await changeTheContrast();

  expect(await shownPage(appSession(), "Appearance")).toBe("Appearance");
});

test("keeps Back inside the app on a page kept through a contrast change", async () => {
  await openAppearanceSettings();
  await changeTheContrast();
  await shownPage(appSession(), "Appearance");

  await pressBack();

  expect(await shownPage(appSession(), "Library")).toBe("Library");
  expect(await appState()).toBe(RUNNING_IN_FOREGROUND);
});

test("stays on a series page when Android's colour contrast changes", async () => {
  await showSampleSeries();
  const pathBefore = await appSession().run(SHOWN_PATH);

  await changeTheContrast();

  expect(await shownPage(appSession(), SAMPLE_SERIES)).toBe(SAMPLE_SERIES);
  expect(await appSession().run(SHOWN_PATH)).toBe(pathBefore);
});

test("keeps a book open at its page when Android's colour contrast changes", async () => {
  await readSampleBookToPage(appSession(), SAVED_PAGE);

  await changeTheContrast();

  const counter = await appSession().waitFor(PAGE_COUNTER);
  expect(await counter.text()).toMatch(new RegExp(`^${String(SAVED_PAGE)} / `));
});
