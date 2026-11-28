import type { Locator, Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import {
  commandsAsked,
  emitFakeEvent,
  type FakeBackend,
} from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleSeries } from "./series-catalog.ts";

const WRITER_COUNT = 300;
const CHANGES_IN_A_BURST = 20;
const MOST_SECTIONS_NEAR_THE_SCREEN = 8;
const READS_IN_FLIGHT_AND_TRAILING = 2;
const MOST_READS_AFTER_A_BURST =
  (READS_IN_FLIGHT_AND_TRAILING + 1) * MOST_SECTIONS_NEAR_THE_SCREEN;
const FRESH_TITLE = "Sample Series Renamed";
const FIRST_DRAW_OF_EVERY_SECTION_MS = 30_000;

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
let namesHeld: Promise<void> | undefined;
let sectionReadsHeld: Promise<void> | undefined;

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
      await namesHeld;
      return { writers: WRITERS, next: null };
    },
    writerSeries: async (writer) => {
      seriesReads += 1;
      await sectionReadsHeld;
      return { series: seriesOf(writer), next: null };
    },
    writerSeriesCount: async () => {
      countReads += 1;
      await sectionReadsHeld;
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
  namesHeld = undefined;
  sectionReadsHeld = undefined;
});

function group(page: Page, name: string): Locator {
  return page.getByRole("region", { name, exact: true });
}

function held(): {
  readonly until: Promise<void>;
  readonly release: () => void;
} {
  let release = (): void => undefined;
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { until, release };
}

function holdSectionReads(): () => void {
  const reads = held();
  sectionReadsHeld = reads.until;
  return () => {
    sectionReadsHeld = undefined;
    reads.release();
  };
}

function holdAnswers(): () => void {
  const names = held();
  namesHeld = names.until;
  const releaseSectionReads = holdSectionReads();
  return () => {
    namesHeld = undefined;
    names.release();
    releaseSectionReads();
  };
}

async function burstOfChanges(page: Page): Promise<void> {
  for (let change = 0; change < CHANGES_IN_A_BURST; change += 1) {
    await emitFakeEvent(page, "library-changed");
  }
}

async function everyReadAnswered(page: Page): Promise<void> {
  await expect
    .poll(async () => (await commandsAsked(page)).unanswered, {
      timeout: FIRST_DRAW_OF_EVERY_SECTION_MS,
    })
    .toBe(0);
}

function resetReads(): void {
  seriesReads = 0;
  countReads = 0;
  nameReads = 0;
}

test("reloads only the writers' sections near the screen during a burst of library changes", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => seriesReads).toBe(WRITER_COUNT);
  await everyReadAnswered(page);
  resetReads();

  isLastRenamed = true;
  const release = holdAnswers();
  await burstOfChanges(page);
  release();
  const last = group(page, writerName(WRITER_COUNT));
  await last.scrollIntoViewIfNeeded();

  await expect(last.getByText(FRESH_TITLE)).toBeVisible();
  expect(seriesReads).toBeLessThanOrEqual(MOST_READS_AFTER_A_BURST);
  expect(countReads).toBeLessThanOrEqual(MOST_READS_AFTER_A_BURST);
  expect(nameReads).toBeLessThanOrEqual(READS_IN_FLIGHT_AND_TRAILING);
});

test("reads each far section once when a burst of library changes comes before its first read answers", async ({
  page,
}) => {
  const release = holdSectionReads();
  await page.goto("/");
  await expect.poll(() => seriesReads).toBe(WRITER_COUNT);

  await burstOfChanges(page);
  release();
  await everyReadAnswered(page);

  expect(seriesReads).toBeLessThanOrEqual(
    WRITER_COUNT + MOST_READS_AFTER_A_BURST,
  );
});
