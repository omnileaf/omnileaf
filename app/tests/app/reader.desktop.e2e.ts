import { afterEach, expect, test } from "vitest";

import { useAppSession } from "./app-session.ts";
import { pageShownScript } from "./page-shown.ts";
import {
  BACK_TO_THE_SERIES,
  FIRST_SERIES_COVER,
  goBackToTheLibrary,
  NEXT_PAGE,
  openSampleBook,
  openSampleSeries,
  sampleBookLink,
  sampleBookRow,
  shownPageCount,
} from "./sample-book.ts";
import { xpath } from "./webdriver.ts";

const FIRST_BOOK_LINK = sampleBookLink(1);
const SERIES_HEADING = xpath("//h1[normalize-space()='Sample Series 01']");
const FIRST_BOOK_HEADING = xpath(
  "//main/h1[normalize-space()='Sample Series 01 v01']",
);
const PAGE_COUNT_SHOWN = xpath(
  "//main//span[contains(normalize-space(), ' / 8')]",
);

const appSession = useAppSession();

afterEach(async () => {
  await goBackToTheLibrary(appSession());
});

async function openFirstBook(): Promise<void> {
  await openSampleBook(appSession(), 1);
}

test("opens a book of the folder added on its first page, read from the omni protocol", async () => {
  await openFirstBook();

  await appSession().waitUntil(pageShownScript(1), "the first page shown");

  await appSession().waitFor(FIRST_BOOK_HEADING);
  const count = await appSession().waitFor(shownPageCount(1, 8));
  expect(await count.text()).toBe("1 / 8");
});

test("turns to the next page with a tap on the page's right edge", async () => {
  await openFirstBook();
  await appSession().waitUntil(pageShownScript(1), "the first page shown");

  await (await appSession().waitFor(NEXT_PAGE)).click();

  await appSession().waitUntil(pageShownScript(2), "the second page shown");
  const count = await appSession().waitFor(shownPageCount(2, 8));
  expect(await count.text()).toBe("2 / 8");
});

test("shows on the series page the page reached once back from the book through the library", async () => {
  await openFirstBook();
  const count = await appSession().waitFor(PAGE_COUNT_SHOWN);
  const opened = Number(/(\d+) \/ 8/.exec(await count.text())?.[1]);
  const reached = opened + 1;
  await (await appSession().waitFor(NEXT_PAGE)).click();
  await appSession().waitUntil(
    pageShownScript(reached),
    `page ${String(reached)} shown`,
  );

  await appSession().back();
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();

  await appSession().waitFor(SERIES_HEADING);
  const row = await appSession().waitFor(
    xpath(
      `${sampleBookRow(1)}[contains(normalize-space(), 'Page ${String(reached)}')]`,
    ),
  );
  const upNext = await appSession().waitFor(
    xpath("//main//a[starts-with(normalize-space(), 'Continue ')]"),
  );
  expect(await row.text()).toContain(`Page ${String(reached)}`);
  expect(await upNext.text()).toBe(
    `Continue Sample Series 01 v01 at page ${String(reached)}`,
  );
});

async function turnAPage(): Promise<number> {
  const count = await appSession().waitFor(PAGE_COUNT_SHOWN);
  const opened = Number(/(\d+) \/ 8/.exec(await count.text())?.[1]);
  const reached = opened + 1;
  await (await appSession().waitFor(NEXT_PAGE)).click();
  await appSession().waitUntil(
    pageShownScript(reached),
    `page ${String(reached)} shown`,
  );
  return reached;
}

test("shows on the series page the page reached in a book started before once it goes straight there from the book", async () => {
  await openSampleSeries(appSession());
  await appSession().waitFor(SERIES_HEADING);
  await (await appSession().waitFor(FIRST_BOOK_LINK)).click();
  await turnAPage();
  await (await appSession().waitFor(BACK_TO_THE_SERIES)).click();
  await (await appSession().waitFor(FIRST_BOOK_LINK)).click();
  const reached = await turnAPage();

  await (await appSession().waitFor(BACK_TO_THE_SERIES)).click();

  await appSession().waitFor(SERIES_HEADING);
  const row = await appSession().waitFor(
    xpath(
      `${sampleBookRow(1)}[contains(normalize-space(), 'Page ${String(reached)}')]`,
    ),
  );
  const upNext = await appSession().waitFor(
    xpath(
      `//main//a[normalize-space()='Continue Sample Series 01 v01 at page ${String(reached)}']`,
    ),
  );
  expect(await row.text()).toContain(`Page ${String(reached)}`);
  expect(await upNext.text()).toBe(
    `Continue Sample Series 01 v01 at page ${String(reached)}`,
  );
});
