import { afterAll, beforeAll, expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import {
  addSampleLibraryFromFiles,
  putSampleLibraryOnTheDevice,
  removeSampleLibraryFromTheDevice,
} from "./files-sample-library.ts";
import { xpath } from "./webdriver.ts";

const SETUP_TIMEOUT_MS = 180_000;

const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);
const SERIES_PAGE_HEADING = xpath("//main[.//a[@data-back-link]]//h1");
const FIRST_BOOK = xpath("//ul[@aria-label='Books']/li[1]");
const SCROLL_TO_THE_BOOKS = `const books = document.querySelector("ul[aria-label='Books']");
if (books === null) { return false; }
books.scrollIntoView({ block: "start" });
return true;`;

const appSession = useAppSession();

async function openFirstSeries(): Promise<string> {
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  return (await appSession().waitFor(SERIES_PAGE_HEADING)).text();
}

beforeAll(async () => {
  await putSampleLibraryOnTheDevice();
  await addSampleLibraryFromFiles(appSession());
}, SETUP_TIMEOUT_MS);

afterAll(removeSampleLibraryFromTheDevice);

test("opens a series of a folder picked in Files on its own page, with its books in order", async () => {
  const heading = await openFirstSeries();

  expect(heading).toBe("Sample Series 01");
  await appSession().waitUntil(
    SCROLL_TO_THE_BOOKS,
    "the books list scrolled into view",
  );
  const first = await appSession().waitFor(FIRST_BOOK);
  expect(await first.text()).toMatch(/^Sample Series 01 v01/);
});
