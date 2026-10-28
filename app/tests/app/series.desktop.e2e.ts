import { expect, test } from "vitest";

import { addSampleLibrary, useAppSession } from "./app-session.ts";
import {
  BACK_TO_THE_SERIES,
  NEXT_PAGE,
  sampleBookEntry,
  sampleBookLink,
  sampleBookTitle,
  showTheBooks,
  SHOWS_VOLUMES_AS_COVERS,
} from "./sample-book.ts";
import { xpath } from "./webdriver.ts";

const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);
const SERIES_HEADING = xpath("//h1[normalize-space()='Sample Series 01']");
const FIRST_BOOK = xpath(sampleBookEntry(1));
const LAST_BOOK_CHECKBOX = xpath(
  "//*[@role='checkbox'][@aria-label='Select Sample Series 01 v03']",
);
const MARK_READ_BUTTON = xpath(
  "//*[@role='group'][@aria-label='Selected books']//button[normalize-space()='Mark read' or @aria-label='Mark read']",
);
const READ_COUNT = xpath("//main//p[normalize-space()='1 of 3 read']");
const READER_MORE = xpath("//button[@aria-label='More']");
const READER_MARK_READ = xpath(
  "//*[@role='menuitem'][normalize-space()='Mark read']",
);
const LAST_COVER_MARKED_READ = xpath(
  `${sampleBookEntry(3)}[.//*[@data-read-mark]]`,
);

const appSession = useAppSession();

async function openFirstSeries(): Promise<void> {
  await addSampleLibrary(appSession());
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  await appSession().waitFor(SERIES_HEADING);
  await showTheBooks(appSession());
}

test("opens a series of the folder added on its own page, with its books in order", async () => {
  await openFirstSeries();

  const first = await appSession().waitFor(FIRST_BOOK);

  expect(await first.text()).toMatch(new RegExp(`^${sampleBookTitle(1)}\\b`));
});

test.skipIf(SHOWS_VOLUMES_AS_COVERS)(
  "marks a book of the series read",
  async () => {
    await openFirstSeries();
    await (await appSession().waitFor(LAST_BOOK_CHECKBOX)).click();

    await (await appSession().waitFor(MARK_READ_BUTTON)).click();

    const count = await appSession().waitFor(READ_COUNT);
    expect(await count.text()).toBe("1 of 3 read");
  },
);

test.runIf(SHOWS_VOLUMES_AS_COVERS)(
  "marks a volume read from its book and ticks its cover",
  async () => {
    await openFirstSeries();
    await (await appSession().waitFor(sampleBookLink(3))).click();
    await appSession().waitFor(NEXT_PAGE);
    await (await appSession().waitFor(READER_MORE)).click();

    await (await appSession().waitFor(READER_MARK_READ)).click();
    await (await appSession().waitFor(BACK_TO_THE_SERIES)).click();
    await showTheBooks(appSession());

    const cover = await appSession().waitFor(LAST_COVER_MARKED_READ);
    expect(await cover.text()).toMatch(new RegExp(`^${sampleBookTitle(3)}\\b`));
  },
);
