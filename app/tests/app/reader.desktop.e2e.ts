import { afterEach, expect, test } from "vitest";

import { addSampleLibrary, useAppSession } from "./app-session.ts";
import { pageShownScript } from "./page-shown.ts";
import { xpath } from "./webdriver.ts";

const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);
const FIRST_BOOK_LINK = xpath(
  "//ul[@aria-label='Books']/li[1]//a[starts-with(normalize-space(), 'Sample Series 01 v01')]",
);
const SERIES_HEADING = xpath("//h1[normalize-space()='Sample Series 01']");
const NEXT_PAGE = xpath("//button[@aria-label='Next page']");
const BACK_TO_THE_LIBRARY = xpath(
  "//main//a[@href='/'] | //nav//a[normalize-space()='Library']",
);

const appSession = useAppSession();

afterEach(async () => {
  await (await appSession().waitFor(BACK_TO_THE_LIBRARY)).click();
});

async function openFirstBook(): Promise<void> {
  await addSampleLibrary(appSession());
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  await (await appSession().waitFor(FIRST_BOOK_LINK)).click();
  await appSession().waitFor(NEXT_PAGE);
}

test("opens a book of the folder added on its first page, read from the omni protocol", async () => {
  await openFirstBook();

  await appSession().waitUntil(pageShownScript(1), "the first page shown");

  const line = await appSession().waitFor(
    xpath("//header//p[contains(normalize-space(), 'Page 1 of 8')]"),
  );
  expect(await line.text()).toBe("Sample Series 01 v01 · Page 1 of 8");
});

test("turns to the next page with a tap on the page's right edge", async () => {
  await openFirstBook();
  await appSession().waitUntil(pageShownScript(1), "the first page shown");

  await (await appSession().waitFor(NEXT_PAGE)).click();

  await appSession().waitUntil(pageShownScript(2), "the second page shown");
  const line = await appSession().waitFor(
    xpath("//header//p[contains(normalize-space(), 'Page 2 of 8')]"),
  );
  expect(await line.text()).toBe("Sample Series 01 v01 · Page 2 of 8");
});

test("shows on the series page the page reached once back from the book through the library", async () => {
  await openFirstBook();
  const line = await appSession().waitFor(
    xpath("//header//p[contains(normalize-space(), ' of 8')]"),
  );
  const opened = Number(/Page (\d+) of 8/.exec(await line.text())?.[1]);
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
      `//ul[@aria-label='Books']/li[1][contains(normalize-space(), 'Page ${String(reached)}')]`,
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

/** A script that follows an in-app link to `pathname`, as a link on the page shown would, since the reader links to no series. */
function followLinkScript(pathname: string): string {
  return `const link = document.createElement("a"); link.href = ${JSON.stringify(pathname)}; document.body.append(link); link.click(); return true;`;
}

/** Turns from the page the book opened on to the next, returning the page reached. */
async function turnAPage(): Promise<number> {
  const line = await appSession().waitFor(
    xpath("//header//p[contains(normalize-space(), ' of 8')]"),
  );
  const opened = Number(/Page (\d+) of 8/.exec(await line.text())?.[1]);
  const reached = opened + 1;
  await (await appSession().waitFor(NEXT_PAGE)).click();
  await appSession().waitUntil(
    pageShownScript(reached),
    `page ${String(reached)} shown`,
  );
  return reached;
}

test("shows on the series page the page reached in a book started before once it goes straight there from the book", async () => {
  await addSampleLibrary(appSession());
  await (await appSession().waitFor(FIRST_SERIES_COVER)).click();
  await appSession().waitFor(SERIES_HEADING);
  const series = new URL(await appSession().url()).pathname;
  await (await appSession().waitFor(FIRST_BOOK_LINK)).click();
  await turnAPage();
  await appSession().waitUntil(followLinkScript(series), "the series page");
  await (await appSession().waitFor(FIRST_BOOK_LINK)).click();
  const reached = await turnAPage();

  await appSession().waitUntil(followLinkScript(series), "the series page");

  await appSession().waitFor(SERIES_HEADING);
  const row = await appSession().waitFor(
    xpath(
      `//ul[@aria-label='Books']/li[1][contains(normalize-space(), 'Page ${String(reached)}')]`,
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
