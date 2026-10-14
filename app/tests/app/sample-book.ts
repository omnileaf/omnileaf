import { addSampleLibrary } from "./app-session.ts";
import { type Locator, type Session, xpath } from "./webdriver.ts";

export const NEXT_PAGE = xpath("//button[@aria-label='Next page']");
export const BACK_TO_THE_LIBRARY = xpath(
  "//main//a[@href='/'] | //nav//a[normalize-space()='Library']",
);
export const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);

/** The link to the book at `position` in the sample library's first series, counting from 1. */
export function sampleBookLink(position: number): Locator {
  return xpath(
    `//ul[@aria-label='Books']/li[${String(position)}]//a[starts-with(normalize-space(), 'Sample Series 01 v0${String(position)}')]`,
  );
}

/** Adds the sample library and opens its first series. */
export async function openSampleSeries(session: Session): Promise<void> {
  await addSampleLibrary(session);
  await (await session.waitFor(FIRST_SERIES_COVER)).click();
}

/** Adds the sample library and opens the book at `position` in its first series in the reader. */
export async function openSampleBook(
  session: Session,
  position: number,
): Promise<void> {
  await openSampleSeries(session);
  await (await session.waitFor(sampleBookLink(position))).click();
  await session.waitFor(NEXT_PAGE);
}
