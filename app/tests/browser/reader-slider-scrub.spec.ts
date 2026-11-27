import type { Locator, Page, Request } from "@playwright/test";

import { PAGES_LOADING_AT_ONCE } from "../../src/lib/reader/page-requests.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  markStripSeen,
  NEXT_BOOK,
  NOT_STARTED,
  readerBook,
  servePages,
  tallStripBook,
} from "./reader-book.ts";

const LONG_BOOK_PAGES = 200;
const ANSWER_MS = 300;
const STEPS_PER_SWEEP = 40;
const SWEEPS_BACK_AND_FORTH = 10;
const MOST_PAGES_ASKED = 12;
const PAST_THE_TRACK_PX = 40;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Track {
  readonly grip: Point;
  readonly start: Point;
  readonly end: Point;
}

interface PageTraffic {
  readonly asked: readonly number[];
  readonly mostInFlight: () => number;
}

async function servePagesSlowly(page: Page): Promise<PageTraffic> {
  const inFlight = new Set<Request>();
  let most = 0;
  const settle = (request: Request): void => {
    inFlight.delete(request);
  };
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  const asked = await servePages(page, async (route) => {
    inFlight.add(route.request());
    most = Math.max(most, inFlight.size);
    await new Promise((answered) => setTimeout(answered, ANSWER_MS));
  });
  return { asked, mostInFlight: () => most };
}

function slider(page: Page): Locator {
  return page.getByRole("slider", { name: "Page" });
}

function pageImage(page: Page, number: number): Locator {
  return page.getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

async function alongTrack(locator: Locator): Promise<Track> {
  const box = await boxOf(locator);
  const y = box.y + box.height / 2;
  return {
    grip: { x: box.x + box.width / 2, y },
    start: { x: box.x - PAST_THE_TRACK_PX, y },
    end: { x: box.x + box.width + PAST_THE_TRACK_PX, y },
  };
}

async function downTrack(locator: Locator): Promise<Track> {
  const box = await boxOf(locator);
  const x = box.x + box.width / 2;
  return {
    grip: { x, y: box.y + box.height / 2 },
    start: { x, y: box.y - PAST_THE_TRACK_PX },
    end: { x, y: box.y + box.height + PAST_THE_TRACK_PX },
  };
}

async function scrubWithoutLettingGo(page: Page, track: Track): Promise<void> {
  await page.mouse.move(track.grip.x, track.grip.y);
  await page.mouse.down();
  for (let sweep = 0; sweep <= SWEEPS_BACK_AND_FORTH; sweep += 1) {
    const to = sweep % 2 === 0 ? track.end : track.start;
    await page.mouse.move(to.x, to.y, { steps: STEPS_PER_SWEEP });
  }
}

async function expectPageShown(page: Page, number: number): Promise<void> {
  await expect(pageImage(page, number)).toBeVisible();
  await expect(slider(page)).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(LONG_BOOK_PAGES)}`,
  );
}

async function expectPageArrived(page: Page, number: number): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator(`img[alt="Page ${String(number)}"]`)
        .evaluate(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0,
        ),
    )
    .toBe(true);
}

test.describe("scrubbing a long book's page slider", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({ ...readerBook(NOT_STARTED, LONG_BOOK_PAGES), id }),
    },
  });

  async function openLongBook(page: Page): Promise<PageTraffic> {
    const traffic = await servePagesSlowly(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expectPageShown(page, 1);
    return traffic;
  }

  test("asks only for the page the thumb rests on, a few at a time, however long the slider is held", async ({
    page,
  }) => {
    const traffic = await openLongBook(page);
    const askedBefore = traffic.asked.length;

    await scrubWithoutLettingGo(page, await alongTrack(slider(page)));

    await expect(slider(page)).toHaveAttribute(
      "aria-valuetext",
      `Page ${String(LONG_BOOK_PAGES)} of ${String(LONG_BOOK_PAGES)}`,
    );
    await page.mouse.up();
    await expectPageShown(page, LONG_BOOK_PAGES);
    expect(traffic.mostInFlight()).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
    expect(traffic.asked.length - askedBefore).toBeLessThanOrEqual(
      MOST_PAGES_ASKED,
    );
  });

  test("opens the next chapter on its first page straight after a scrub, still a few pages at a time", async ({
    page,
  }) => {
    const traffic = await openLongBook(page);

    await scrubWithoutLettingGo(page, await alongTrack(slider(page)));
    await page.mouse.up();
    await page
      .getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` })
      .click();

    await expect(page).toHaveURL(new RegExp(`/read/${NEXT_BOOK.id}$`));
    await expectPageShown(page, 1);
    expect(traffic.mostInFlight()).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
  });
});

test.describe(
  "scrubbing a long strip's page slider",
  { tag: "@native" },
  () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        openBook: () => tallStripBook(null, LONG_BOOK_PAGES),
      },
    });

    test("asks only for the pages the thumb rests on, a few at a time, however long the slider is held", async ({
      page,
      platform,
    }) => {
      await markStripSeen(page);
      const traffic = await servePagesSlowly(page);
      await page.goto(`/read/${BOOK_ID}`);
      await expectPageArrived(page, 1);
      const askedBefore = traffic.asked.length;
      const track =
        platform === "android"
          ? await downTrack(page.locator("[data-scrubber]"))
          : await alongTrack(slider(page));

      await scrubWithoutLettingGo(page, track);
      await page.mouse.up();

      await expectPageArrived(page, LONG_BOOK_PAGES);
      await expect(
        page.getByRole("slider", { name: "Page" }).first(),
      ).toHaveAttribute(
        "aria-valuetext",
        `Page ${String(LONG_BOOK_PAGES)} of ${String(LONG_BOOK_PAGES)}`,
      );
      expect(traffic.mostInFlight()).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
      expect(traffic.asked.length - askedBefore).toBeLessThanOrEqual(
        MOST_PAGES_ASKED,
      );
    });
  },
);
