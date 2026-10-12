import { addSampleLibrary } from "./app-session.ts";
import { type Locator, type Session, xpath } from "./webdriver.ts";

export const NEXT_PAGE = xpath("//button[@aria-label='Next page']");
export const BACK_TO_THE_LIBRARY = xpath(
  "//main//a[@href='/'] | //nav//a[normalize-space()='Library']",
);
export const FIRST_SERIES_COVER = xpath(
  "//ul[@aria-label='Series']//a[.//*[normalize-space()='Sample Series 01']]",
);

export function sampleBookLink(position: number): Locator {
  return xpath(
    `//ul[@aria-label='Books']/li[${String(position)}]//a[starts-with(normalize-space(), 'Sample Series 01 v0${String(position)}')]`,
  );
}

export async function openSampleSeries(session: Session): Promise<void> {
  await addSampleLibrary(session);
  await (await session.waitFor(FIRST_SERIES_COVER)).click();
}

export async function openSampleBook(
  session: Session,
  position: number,
): Promise<void> {
  await openSampleSeries(session);
  await (await session.waitFor(sampleBookLink(position))).click();
  await session.waitFor(NEXT_PAGE);
}
