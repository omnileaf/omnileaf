import type { Locator, Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import { emitFakeEvent, type FakeBackend } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WRITER_COUNT = 300;
const CHANGES_IN_A_BURST = 20;
const MOST_SECTIONS_NEAR_THE_SCREEN = 8;
const READS_IN_FLIGHT_AND_TRAILING = 2;
const MOST_READS_AFTER_A_BURST =
  (READS_IN_FLIGHT_AND_TRAILING + 1) * MOST_SECTIONS_NEAR_THE_SCREEN;
const FRESH_TITLE = "Sample Series Renamed";

function writerName(number: number): string {
  return `Author ${String(number).padStart(3, "0")}`;
}

const WRITERS = Array.from({ length: WRITER_COUNT }, (_, index) => ({
  name: writerName(index + 1),
  seriesCount: 1,
}));

let seriesReads = 0;
let countReads = 0;
let nameReads = 0;
let isLastRenamed = false;
let answersHeld: Promise<void> | undefined;

function seriesOf(writer: string) {
  const number = Number(writer.slice(-3));
  return sampleSeries(1, number).map((series) =>
    number === WRITER_COUNT && isLastRenamed
      ? { ...series, title: FRESH_TITLE }
      : series,
  );
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: () => ({ series: sampleSeries(WRITER_COUNT), next: null }),
    librarySeriesCount: () => WRITER_COUNT,
    libraryWriters: async () => {
      nameReads += 1;
      await answersHeld;
      return { writers: WRITERS, next: null };
    },
    writerSeries: async (writer) => {
      seriesReads += 1;
      await answersHeld;
      return { series: seriesOf(writer), next: null };
    },
    writerSeriesCount: async () => {
      countReads += 1;
      await answersHeld;
      return 1;
    },
    libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, groupBy: "creator" }),
  } satisfies FakeBackend,
});

test.beforeEach(() => {
  seriesReads = 0;
  countReads = 0;
  nameReads = 0;
  isLastRenamed = false;
  answersHeld = undefined;
});

function group(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

test("reloads only the writers' sections near the screen during a burst of library changes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(group(page, writerName(1))).toBeVisible();
  await expect.poll(() => seriesReads).toBe(WRITER_COUNT);
  seriesReads = 0;
  countReads = 0;
  nameReads = 0;

  isLastRenamed = true;
  let answer = (): void => undefined;
  answersHeld = new Promise((resolve) => {
    answer = resolve;
  });
  for (let change = 0; change < CHANGES_IN_A_BURST; change += 1) {
    await emitFakeEvent(page, "library-changed");
  }
  answersHeld = undefined;
  answer();
  const last = group(page, writerName(WRITER_COUNT));
  await last.scrollIntoViewIfNeeded();

  await expect(last.getByText(FRESH_TITLE)).toBeVisible();
  expect(seriesReads).toBeLessThanOrEqual(MOST_READS_AFTER_A_BURST);
  expect(countReads).toBeLessThanOrEqual(MOST_READS_AFTER_A_BURST);
  expect(nameReads).toBeLessThanOrEqual(READS_IN_FLIGHT_AND_TRAILING);
});
