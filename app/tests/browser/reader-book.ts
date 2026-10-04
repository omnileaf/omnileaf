import type { Page, Route } from "@playwright/test";

import { type FakeBackend, fakeProtocolRoute } from "./fake-backend.ts";

type WireBook = Awaited<ReturnType<FakeBackend["openBook"]>>;
type WireReading = WireBook["reading"];

export const BOOK_ID = "0190a3e4-0000-8000-8000-0000000000b1";
export const BOOK_SERIES_ID = "0190a3e4-0000-8000-8000-0000000000a1";
export const BOOK_TITLE = "Sample Series 01 v01";
export const BOOK_SERIES_TITLE = "Sample Series 01";
export const PAGE_COUNT = 30;
export const PAGE_WIDTH = 1800;
export const PAGE_HEIGHT = 2700;

const PAGE_PATH = new RegExp(`/page/v1/${BOOK_ID}/1/(\\d+)$`);

/** A generated book whose pages are all the same portrait size. */
export function readerBook(reading: WireReading): WireBook {
  return {
    id: BOOK_ID,
    title: BOOK_TITLE,
    series: BOOK_SERIES_ID,
    seriesTitle: BOOK_SERIES_TITLE,
    pages: Array.from({ length: PAGE_COUNT }, (_, index) => ({
      path: `page/v1/${BOOK_ID}/1/${String(index)}`,
      size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    })),
    reading,
  };
}

/** A page drawn with its number, so a screenshot shows which one is up. */
function pageImage(index: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(PAGE_WIDTH)}" height="${String(PAGE_HEIGHT)}" viewBox="0 0 ${String(PAGE_WIDTH)} ${String(PAGE_HEIGHT)}"><rect width="${String(PAGE_WIDTH)}" height="${String(PAGE_HEIGHT)}" fill="#f4f1ea"/><rect x="120" y="120" width="1560" height="1100" fill="#d9d4c8" stroke="#1c1b18" stroke-width="12"/><text x="900" y="2000" font-size="400" text-anchor="middle" fill="#1c1b18">${String(index + 1)}</text></svg>`;
}

/** The index of the page a request is for, or nothing for any other request. */
export function pageIndexOf(url: string): number | undefined {
  const found = PAGE_PATH.exec(url);
  return found?.[1] === undefined ? undefined : Number(found[1]);
}

export async function servePages(
  page: Page,
  before: (route: Route, index: number) => Promise<void> = async () => {},
): Promise<number[]> {
  const asked: number[] = [];
  await page.route(fakeProtocolRoute("omni"), async (route) => {
    const index = pageIndexOf(route.request().url());
    if (index === undefined) {
      await route.fulfill({ status: 404 });
      return;
    }
    asked.push(index);
    await before(route, index);
    await route.fulfill({
      contentType: "image/svg+xml",
      headers: { "cache-control": "public, max-age=31536000, immutable" },
      body: pageImage(index),
    });
  });
  return asked;
}

export const readerBackend = (
  base: FakeBackend,
  reading: WireReading = { state: "notStarted" },
): FakeBackend => ({
  ...base,
  openBook: () => readerBook(reading),
});
