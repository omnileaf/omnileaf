import { expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { xpath } from "./webdriver.ts";

const LIBRARY_LINK = xpath("//nav//a[normalize-space()='Library']");
const ADD_FOLDER_BUTTON = xpath("//button[normalize-space()='Add a folder']");
const FINISHED_SCAN_REPORT = xpath(
  "//*[@role='status'][starts-with(normalize-space(), 'Found ')]",
);
const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);
const SERIES_HEADING = xpath("//h1[normalize-space()='Sample Series 01']");
const FIRST_BOOK = xpath("//ul[@aria-label='Books']/li[1]");
const SELECT_BUTTON = xpath("//main//button[normalize-space()='Select']");
const FIRST_BOOK_CHECKBOX = xpath(
  "//input[@type='checkbox'][@aria-label='Select Sample Series 01 v01']",
);
const MARK_READ_BUTTON = xpath(
  "//*[@role='group'][@aria-label='Selected books']//button[normalize-space()='Mark read']",
);
const READ_COUNT = xpath("//main//p[normalize-space()='1 of 3 read']");

const appSession = useAppSession();

async function openFirstSeries(): Promise<void> {
  await (await appSession().waitFor(LIBRARY_LINK)).click();
  await (await appSession().waitFor(ADD_FOLDER_BUTTON)).click();
  await appSession().waitFor(FINISHED_SCAN_REPORT);
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  await appSession().waitFor(SERIES_HEADING);
}

test("opens a series of the folder added on its own page, with its books in order", async () => {
  await openFirstSeries();

  const first = await appSession().waitFor(FIRST_BOOK);

  expect(await first.text()).toMatch(/^Sample Series 01 v01/);
});

test("marks a book of the series read", async () => {
  await openFirstSeries();
  await (await appSession().waitFor(SELECT_BUTTON)).click();
  await (await appSession().waitFor(FIRST_BOOK_CHECKBOX)).click();

  await (await appSession().waitFor(MARK_READ_BUTTON)).click();

  const count = await appSession().waitFor(READ_COUNT);
  expect(await count.text()).toBe("1 of 3 read");
});
