import { afterEach, expect, test } from "vitest";

import { mainNavigationLink, useAppSession } from "./app-session.ts";
import { pageShownScript } from "./page-shown.ts";
import {
  BACK_TO_THE_LIBRARY,
  NEXT_PAGE,
  openSampleBook,
} from "./sample-book.ts";
import { xpath } from "./webdriver.ts";

const PAGE_READ_TO = 3;
const BACK_FROM_THE_READER = xpath("//main//a[@href='/']");
const LIBRARY_HEADING = xpath("//h1[normalize-space()='Library']");
const LATEST_SESSION = xpath(
  `//main//section[1]//li[1][contains(normalize-space(), 'Sample Series 01 v03 · page ${String(PAGE_READ_TO)} of 8')]`,
);

/** Clicks the link of the latest session that the screen's size shows, the row on narrow windows and its button on wide ones. */
const CONTINUE_LATEST_SESSION = `const link = [...document.querySelectorAll("main section li a")].find((shown) => shown.offsetParent !== null);
if (link === undefined) { return false; }
link.click();
return true;`;

const appSession = useAppSession();

afterEach(async () => {
  await (await appSession().waitFor(BACK_TO_THE_LIBRARY)).click();
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
  await (await appSession().waitFor(BACK_FROM_THE_READER)).click();

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
  const line = await appSession().waitFor(
    xpath(
      `//header//p[contains(normalize-space(), 'Page ${String(PAGE_READ_TO)} of 8')]`,
    ),
  );
  expect(await line.text()).toBe("Sample Series 01 v03 · Page 3 of 8");
});
