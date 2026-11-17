import { afterAll, beforeAll, expect, test } from "vitest";

import { androidSetting } from "./android-settings.ts";
import {
  clickWhenShown,
  mainNavigationLink,
  settingsRow,
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
  NEXT_PAGE,
  sampleBookLink,
  showTheBooks,
} from "./sample-book.ts";
import { xpath } from "./webdriver.ts";

const SETUP_TIMEOUT_MS = 180_000;
const STANDARD_CONTRAST = "0";
const HIGH_CONTRAST = "1";
const SAMPLE_SERIES = "Sample Series 01";
const SAVED_PAGE = 3;
const GUIDE_TIMEOUT_MS = 3_000;
const SHOWN_PATH = "return location.pathname;";
const PAGE_SHOWN = xpath(
  `//main//span[starts-with(normalize-space(), '${String(SAVED_PAGE)} / ')]`,
);
const GOT_IT = xpath("//*[@role='note']//button[normalize-space()='Got it']");
const TOLD_BACK_ON_PAGE =
  "return [...document.querySelectorAll('[data-sonner-toast]')].some((toast) => toast.textContent.includes('Back on page'));";

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

async function openSampleSeries(): Promise<void> {
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  await shownPage(appSession(), SAMPLE_SERIES);
}

test("stays on a Settings page when Android's colour contrast changes", async () => {
  await clickWhenShown(appSession(), mainNavigationLink("Settings"));
  await clickWhenShown(appSession(), settingsRow("Appearance"));
  await shownPage(appSession(), "Appearance");

  await changeTheContrast();

  expect(await shownPage(appSession(), "Appearance")).toBe("Appearance");
});

test("stays on a series page when Android's colour contrast changes", async () => {
  await openSampleSeries();
  const pathBefore = await appSession().run(SHOWN_PATH);

  await changeTheContrast();

  expect(await shownPage(appSession(), SAMPLE_SERIES)).toBe(SAMPLE_SERIES);
  expect(await appSession().run(SHOWN_PATH)).toBe(pathBefore);
});

test("keeps a book open at its page when Android's colour contrast changes", async () => {
  await openSampleSeries();
  await showTheBooks(appSession());
  await (await appSession().waitFor(sampleBookLink(1))).click();
  const card = await appSession().findWithin(GOT_IT, GUIDE_TIMEOUT_MS);
  await card?.click();
  for (let turned = 1; turned < SAVED_PAGE; turned += 1) {
    await (await appSession().waitFor(NEXT_PAGE)).click();
  }
  await appSession().waitFor(PAGE_SHOWN);

  await changeTheContrast();

  const shown = await appSession().waitFor(PAGE_SHOWN);
  expect((await shown.text()).startsWith(`${String(SAVED_PAGE)} / `)).toBe(
    true,
  );
  expect(await appSession().run(TOLD_BACK_ON_PAGE)).toBe(false);
});
