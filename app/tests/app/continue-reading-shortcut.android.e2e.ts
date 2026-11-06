import { afterAll, beforeAll, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import {
  addSampleLibraryFromFiles,
  putSampleLibraryOnTheDevice,
  removeSampleLibraryFromTheDevice,
} from "./files-sample-library.ts";
import { chooseOnTheIcon } from "./icon-action-intent.ts";
import {
  FIRST_SERIES_COVER,
  goBackToTheLibrary,
  NEXT_PAGE,
  sampleBookLink,
  showTheBooks,
} from "./sample-book.ts";
import { xpath } from "./webdriver.ts";

const SETUP_TIMEOUT_MS = 180_000;
const SAVED_PAGE = 3;
const PAGE_SHOWN = `//main//span[starts-with(normalize-space(), '${String(SAVED_PAGE)} / ')]`;
const ON_THE_BOOK = "return location.pathname.startsWith('/read/');";

const appSession = useAppSession();

beforeAll(async () => {
  await putSampleLibraryOnTheDevice();
  await addSampleLibraryFromFiles(appSession());
}, SETUP_TIMEOUT_MS);

afterAll(removeSampleLibraryFromTheDevice);

test("Continue reading on the icon opens the book last read at its saved page", async () => {
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  await showTheBooks(appSession());
  await (await appSession().waitFor(sampleBookLink(1))).click();
  for (let turned = 1; turned < SAVED_PAGE; turned += 1) {
    await (await appSession().waitFor(NEXT_PAGE)).click();
  }
  await appSession().waitFor(xpath(PAGE_SHOWN));
  await goBackToTheLibrary(appSession());

  await chooseOnTheIcon("continueReading");

  await appSession().waitUntil(ON_THE_BOOK, "the book opened from the icon");
  await appSession().waitFor(xpath(PAGE_SHOWN));
});
