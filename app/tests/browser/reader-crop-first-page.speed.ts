import type { Page } from "@playwright/test";

import type { HistoryEntry } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { median } from "./median.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_SERIES_TITLE,
  BOOK_TITLE,
  NOT_STARTED,
  PAGE_COUNT,
  readerBackend,
  servePages,
} from "./reader-book.ts";

const CROPPED_FIRST_PAGE_BUDGET_MS = 150;
const OPENINGS = 9;
const READ_AT_MS = 1_790_000_000_000;
const DAY_MS = 86_400_000;

declare global {
  interface Window {
    __omnileafBookClickedAt?: number | undefined;
    __omnileafFirstPageShownAt?: number | undefined;
  }
}

const UNFINISHED = {
  book: BOOK_ID,
  bookTitle: BOOK_TITLE,
  series: BOOK_SERIES_ID,
  seriesTitle: BOOK_SERIES_TITLE,
  position: 1,
  cover: null,
  startedAtMs: READ_AT_MS,
  utcOffsetMinutes: 0,
  readSeconds: 600,
  readTo: { state: "page", page: 1, pageCount: PAGE_COUNT },
  reading: { state: "started", page: 1 },
  day: { day: Math.floor(READ_AT_MS / DAY_MS), readSeconds: 600 },
} as HistoryEntry;

function timeTheFirstPage(): void {
  window.__omnileafBookClickedAt = undefined;
  window.__omnileafFirstPageShownAt = undefined;
  document.addEventListener(
    "click",
    (event) => {
      window.__omnileafBookClickedAt = event.timeStamp;
    },
    { capture: true, once: true },
  );
  new MutationObserver((_, observer) => {
    const shown = document.querySelector(
      'img[alt="Page 1"]:not([aria-hidden]):not(.invisible)',
    );
    if (shown === null) {
      return;
    }
    observer.disconnect();
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.__omnileafFirstPageShownAt = performance.now();
      });
    });
  }).observe(document, { attributes: true, childList: true, subtree: true });
}

async function openTheBookTimed(page: Page): Promise<number> {
  await page.goto("/history");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(timeTheFirstPage);

  await page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ hasText: BOOK_SERIES_TITLE })
    .getByRole("link")
    .click();

  const took = await page.waitForFunction(() =>
    window.__omnileafFirstPageShownAt === undefined ||
    window.__omnileafBookClickedAt === undefined
      ? undefined
      : window.__omnileafFirstPageShownAt - window.__omnileafBookClickedAt,
  );
  return Number(await took.jsonValue());
}

test.use({
  backend: {
    ...readerBackend(DEFAULT_BACKEND, NOT_STARTED),
    readingHistory: (_after, of) => ({
      entries: of.kind === "unfinished" ? [] : [UNFINISHED],
      next: null,
    }),
  },
});

test("shows the first page cropped within the budget from the click that opens the book", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("omnileaf.readerGuide.leftToRight", "seen");
    localStorage.setItem(
      "omnileaf.readerSettings.all",
      JSON.stringify({ cropsBorders: true }),
    );
  });
  await page.clock.setFixedTime(new Date(READ_AT_MS));
  await servePages(page);
  await openTheBookTimed(page);
  const timings: number[] = [];

  for (let opening = 0; opening < OPENINGS; opening += 1) {
    timings.push(await openTheBookTimed(page));
  }

  test.info().annotations.push({
    type: "cropped first page",
    description: `median ${median(timings).toFixed(1)} ms of ${timings.map((ms) => `${ms.toFixed(1)} ms`).join(", ")}`,
  });
  await expect(
    page.locator('img[alt="Page 1"]:not([aria-hidden])'),
  ).toHaveAttribute("src", /\/0\/cropped$/);
  expect(median(timings)).toBeLessThanOrEqual(CROPPED_FIRST_PAGE_BUDGET_MS);
});
