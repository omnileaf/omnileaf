import { addSampleLibrary } from "./app-session.ts";
import { type Locator, type Session, xpath } from "./webdriver.ts";

export const NEXT_PAGE = xpath("//button[@aria-label='Next page']");
export const BACK_TO_THE_LIBRARY = xpath(
  "//main//a[@href='/'] | //nav//a[normalize-space()='Library']",
);
export const BACK_TO_THE_SERIES = xpath(
  "//main//a[starts-with(@aria-label, 'Back to ')]",
);
export const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);

export function sampleBookRow(position: number): string {
  return `//table[@aria-label='Books']//tr[@aria-rowindex='${String(position + 1)}']`;
}

export function sampleBookLink(position: number): Locator {
  return xpath(
    `${sampleBookRow(position)}//a[starts-with(normalize-space(), 'Sample Series 01 v0${String(position)}')]`,
  );
}

const SCROLL_TO_THE_BOOKS = `const books = document.querySelector("table[aria-label='Books']");
if (books === null) { return false; }
books.scrollIntoView({ block: "start" });
return true;`;

export async function showTheBooks(session: Session): Promise<void> {
  await session.waitUntil(SCROLL_TO_THE_BOOKS, "the books table in view");
}

export async function openSampleSeries(session: Session): Promise<void> {
  await addSampleLibrary(session);
  await (await session.waitFor(FIRST_SERIES_COVER)).click();
  await showTheBooks(session);
}

export async function openSampleBook(
  session: Session,
  position: number,
): Promise<void> {
  await openSampleSeries(session);
  await (await session.waitFor(sampleBookLink(position))).click();
  await session.waitFor(NEXT_PAGE);
}

export async function goBackToTheLibrary(session: Session): Promise<void> {
  await (
    await session.waitFor(
      xpath(`${BACK_TO_THE_SERIES.value} | ${BACK_TO_THE_LIBRARY.value}`),
    )
  ).click();
  await (await session.waitFor(BACK_TO_THE_LIBRARY)).click();
}

export function shownPageCount(page: number, count: number): Locator {
  return xpath(
    `//main//span[normalize-space()='${String(page)} / ${String(count)}']`,
  );
}
