import { afterAll, beforeAll, expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import {
  addSampleLibraryFromFiles,
  putSampleLibraryOnTheDevice,
  removeSampleLibraryFromTheDevice,
} from "./files-sample-library.ts";
import { chooseOnTheIcon } from "./icon-action-intent.ts";
import { followRestartedApp } from "./restarted-app.ts";
import {
  ON_THE_BOOK,
  pageCounterAt,
  readSampleBookToPage,
} from "./sample-book.ts";
import { ELEMENT_TIMEOUT_MS, xpath } from "./webdriver.ts";

const SETUP_TIMEOUT_MS = 180_000;
const SAVED_PAGE = 3;
const BACK_KEY = 4;
const LIBRARY_HEADING = xpath("//main//h1[normalize-space()='Library']");

const appSession = useAppSession();

beforeAll(async () => {
  await putSampleLibraryOnTheDevice();
  await addSampleLibraryFromFiles(appSession());
}, SETUP_TIMEOUT_MS);

afterAll(removeSampleLibraryFromTheDevice);

test("Continue reading on the icon opens the book last read at its saved page", async () => {
  await readSampleBookToPage(appSession(), SAVED_PAGE);
  await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });
  await appSession().runMobileCommand("pressKey", { keycode: BACK_KEY });
  await appSession().waitFor(LIBRARY_HEADING);

  await chooseOnTheIcon("continueReading");
  await followRestartedApp(appSession());

  await appSession().waitUntil(ON_THE_BOOK, "the book opened from the icon");
  expect(
    await appSession().findWithin(
      pageCounterAt(SAVED_PAGE),
      ELEMENT_TIMEOUT_MS,
    ),
  ).toBeDefined();
});
