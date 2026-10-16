import { afterEach, expect, test } from "vitest";

import { mainNavigationLink, useAppSession } from "./app-session.ts";
import { pageShownScript } from "./page-shown.ts";
import {
  BACK_TO_THE_SERIES,
  goBackToTheLibrary,
  NEXT_PAGE,
  openSampleBook,
  shownPageCount,
} from "./sample-book.ts";
import { xpath } from "./webdriver.ts";

const PAGE_READ_TO = 3;
const LIBRARY_HEADING = xpath("//h1[normalize-space()='Library']");
const LATEST_SESSION = xpath(
  `//main//section[1]//li[1][.//a[contains(normalize-space(), 'Sample Series 01 v03')]][.//*[@aria-label='Page ${String(PAGE_READ_TO)} of 8']]`,
);

const CONTINUE_LATEST_SESSION = `const link = [...document.querySelectorAll("main section li a")].find((shown) => shown.offsetParent !== null);
if (link === undefined) { return false; }
link.click();
return true;`;

const appSession = useAppSession();

afterEach(async () => {
  await goBackToTheLibrary(appSession());
  await appSession().waitFor(LIBRARY_HEADING);
});

async function readThirdBookTo(page: number): Promise<void> {
  await openSampleBook(appSession(), 3);
  await appSession().waitUntil(pageShownScript(1), "the first page shown");
  for (let shown = 2; shown <= page; shown += 1) {
    await (await appSession().waitFor(NEXT_PAGE)).click();
    await appSession().waitUntil(
      pageShownScript(shown),
      `page ${String(shown)} shown`,
    );
  }
}

test("continues the book read last from History on the page it was left on", async () => {
  await readThirdBookTo(PAGE_READ_TO);
  await (await appSession().waitFor(BACK_TO_THE_SERIES)).click();

  await (await appSession().waitFor(mainNavigationLink("History"))).click();
  await appSession().waitFor(LATEST_SESSION);
  await appSession().waitUntil(
    CONTINUE_LATEST_SESSION,
    "the latest session's continue link clicked",
  );

  await appSession().waitUntil(
    pageShownScript(PAGE_READ_TO),
    `page ${String(PAGE_READ_TO)} shown again`,
  );
  await appSession().waitFor(
    xpath("//main//h1[normalize-space()='Sample Series 01 v03']"),
  );
  const count = await appSession().waitFor(shownPageCount(PAGE_READ_TO, 8));
  expect(await count.text()).toBe("3 / 8");
});
