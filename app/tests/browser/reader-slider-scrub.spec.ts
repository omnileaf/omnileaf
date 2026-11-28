import type { CDPSession, Locator, Page } from "@playwright/test";

import {
  PAGES_LOADING_AT_ONCE,
  THUMBNAILS_LOADING_AT_ONCE,
} from "../../src/lib/reader/page-requests.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { type ReaderTraffic, servePagesSlowly } from "./page-traffic.ts";
import {
  BOOK_ID,
  markStripSeen,
  NEXT_BOOK,
  NOT_STARTED,
  readerBook,
  tallStripBook,
} from "./reader-book.ts";

const LONG_BOOK_PAGES = 200;
const STEPS_PER_SWEEP = 40;
const SWEEPS_BACK_AND_FORTH = 10;
const FINGER_STEPS_PER_SWEEP = 20;
const FINGER_SWEEPS_BACK_AND_FORTH = 2;
const PAUSE_AHEAD_MS = 1000;
const MOST_PAGES_ASKED = 12;
const MOST_THUMBNAILS_ASKED = 24;
const INSIDE_THE_TRACK_PX = 1;
const NEAR_THE_END = 0.95;
const TRACK_MIDDLE = 0.5;
const NUDGE_PX = 24;
const NUDGE_STEPS = 4;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Track {
  readonly grip: Point;
  readonly start: Point;
  readonly end: Point;
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
    grip: { x: box.x + box.width * TRACK_MIDDLE, y },
    start: { x: box.x + INSIDE_THE_TRACK_PX, y },
    end: { x: box.x + box.width - INSIDE_THE_TRACK_PX, y },
  };
}

async function downTrack(locator: Locator): Promise<Track> {
  const box = await boxOf(locator);
  const x = box.x + box.width / 2;
  return {
    grip: { x, y: box.y + box.height * TRACK_MIDDLE },
    start: { x, y: box.y + INSIDE_THE_TRACK_PX },
    end: { x, y: box.y + box.height - INSIDE_THE_TRACK_PX },
  };
}

function sweepsOf(track: Track, sweeps: number): Point[] {
  return Array.from({ length: sweeps + 1 }, (_, sweep) =>
    sweep % 2 === 0 ? track.end : track.start,
  );
}

async function scrubWithMouse(page: Page, track: Track): Promise<void> {
  await page.mouse.move(track.grip.x, track.grip.y);
  await page.mouse.down();
  for (const to of sweepsOf(track, SWEEPS_BACK_AND_FORTH)) {
    await page.mouse.move(to.x, to.y, { steps: STEPS_PER_SWEEP });
  }
}

async function touchAt(
  session: CDPSession,
  type: "touchStart" | "touchMove",
  at: Point,
): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: [at],
  });
}

async function scrubWithFinger(
  page: Page,
  session: CDPSession,
  track: Track,
): Promise<void> {
  await page.clock.install();
  await page.clock.pauseAt(
    (await page.evaluate(() => Date.now())) + PAUSE_AHEAD_MS,
  );
  await touchAt(session, "touchStart", track.grip);
  let from = track.grip;
  for (const to of sweepsOf(track, FINGER_SWEEPS_BACK_AND_FORTH)) {
    for (let step = 1; step <= FINGER_STEPS_PER_SWEEP; step += 1) {
      const share = step / FINGER_STEPS_PER_SWEEP;
      await touchAt(session, "touchMove", {
        x: from.x + (to.x - from.x) * share,
        y: from.y + (to.y - from.y) * share,
      });
    }
    from = to;
  }
  await page.clock.resume();
}

async function liftFinger(session: CDPSession): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function pageUnderTheThumb(page: Page): Promise<number> {
  const said = await slider(page).first().getAttribute("aria-valuetext");
  const reached = Number(/Page (\d+) of/.exec(said ?? "")?.[1]);
  expect(reached).toBeGreaterThan(LONG_BOOK_PAGES * NEAR_THE_END);
  return reached;
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

function expectRequestsBounded(
  traffic: ReaderTraffic,
  before: { readonly pages: number; readonly thumbnails: number },
): void {
  expect(traffic.pages.most).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
  expect(traffic.thumbnails.most).toBeLessThanOrEqual(
    THUMBNAILS_LOADING_AT_ONCE,
  );
  expect(traffic.pages.asked.length - before.pages).toBeLessThanOrEqual(
    MOST_PAGES_ASKED,
  );
  expect(
    traffic.thumbnails.asked.length - before.thumbnails,
  ).toBeLessThanOrEqual(MOST_THUMBNAILS_ASKED);
}

function askedSoFar(traffic: ReaderTraffic): {
  pages: number;
  thumbnails: number;
} {
  return {
    pages: traffic.pages.asked.length,
    thumbnails: traffic.thumbnails.asked.length,
  };
}

test.describe("scrubbing a long book's page slider", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: (id) => ({ ...readerBook(NOT_STARTED, LONG_BOOK_PAGES), id }),
    },
  });

  async function openLongBook(page: Page): Promise<ReaderTraffic> {
    const traffic = await servePagesSlowly(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expectPageShown(page, 1);
    return traffic;
  }

  test("asks only for the page and previews the thumb rests on, a few at a time, however long the slider is held", async ({
    page,
  }) => {
    const traffic = await openLongBook(page);
    const before = askedSoFar(traffic);

    await scrubWithMouse(page, await alongTrack(slider(page)));

    const reached = await pageUnderTheThumb(page);
    await page.mouse.up();
    await expectPageShown(page, reached);
    expectRequestsBounded(traffic, before);
  });

  test("asks as few pages and previews when the slider is dragged by a finger", async ({
    page,
    browserName,
    isMobile,
  }) => {
    test.skip(
      browserName !== "chromium" || !isMobile,
      "real touches go through Chromium's DevTools protocol on a touch screen",
    );
    const traffic = await openLongBook(page);
    const before = askedSoFar(traffic);
    const session = await page.context().newCDPSession(page);

    await scrubWithFinger(page, session, await alongTrack(slider(page)));

    const reached = await pageUnderTheThumb(page);
    await liftFinger(session);
    await expectPageShown(page, reached);
    expectRequestsBounded(traffic, before);
  });

  test("shows the page the thumb rests on while the slider is still held", async ({
    page,
  }) => {
    const traffic = await openLongBook(page);
    const track = await alongTrack(slider(page));
    await page.mouse.move(track.grip.x, track.grip.y);
    await page.mouse.down();
    await page.mouse.move(track.end.x, track.end.y, {
      steps: STEPS_PER_SWEEP,
    });

    await page.mouse.move(track.grip.x, track.grip.y, {
      steps: STEPS_PER_SWEEP,
    });

    const resting = Number(await slider(page).inputValue());
    await expectPageShown(page, resting);
    await expect
      .poll(() => traffic.thumbnails.asked.includes(resting - 1))
      .toBe(true);
    await page.mouse.up();
  });

  test("asks only for the previews shown at this width where the thumb rests", async ({
    page,
  }) => {
    const traffic = await openLongBook(page);
    const track = await alongTrack(slider(page));
    await page.mouse.move(track.grip.x, track.grip.y);
    await page.mouse.down();
    const before = traffic.thumbnails.asked.length;

    await page.mouse.move(track.grip.x + NUDGE_PX, track.grip.y, {
      steps: NUDGE_STEPS,
    });

    const shown = (
      await page
        .getByRole("list", { name: "Nearby pages" })
        .getByRole("listitem")
        .filter({ visible: true })
        .allTextContents()
    ).map((number) => Number(number.trim()) - 1);
    await expect
      .poll(() =>
        shown.every((index) =>
          traffic.thumbnails.asked.slice(before).includes(index),
        ),
      )
      .toBe(true);
    const asked = traffic.thumbnails.asked.slice(before);
    expect(asked.toSorted((one, other) => one - other)).toEqual(shown);
    await page.mouse.up();
  });

  test("opens the next chapter on its first page straight after a scrub, still a few pages at a time", async ({
    page,
  }) => {
    const traffic = await openLongBook(page);

    await scrubWithMouse(page, await alongTrack(slider(page)));
    await page.mouse.up();
    await page
      .getByRole("link", { name: `Next chapter: ${NEXT_BOOK.title}` })
      .click();

    await expect(page).toHaveURL(new RegExp(`/read/${NEXT_BOOK.id}$`));
    await expectPageShown(page, 1);
    expect(traffic.pages.most).toBeLessThanOrEqual(PAGES_LOADING_AT_ONCE);
    expect(traffic.thumbnails.most).toBeLessThanOrEqual(
      THUMBNAILS_LOADING_AT_ONCE,
    );
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

    test("asks only for the pages and previews the thumb rests on, a few at a time, however long the slider is held", async ({
      page,
      platform,
    }) => {
      await markStripSeen(page);
      const traffic = await servePagesSlowly(page);
      await page.goto(`/read/${BOOK_ID}`);
      await expectPageArrived(page, 1);
      const before = askedSoFar(traffic);
      const track =
        platform === "android"
          ? await downTrack(page.locator("[data-scrubber]"))
          : await alongTrack(slider(page));

      await scrubWithMouse(page, track);
      const reached = await pageUnderTheThumb(page);
      await page.mouse.up();

      await expectPageArrived(page, reached);
      expectRequestsBounded(traffic, before);
    });
  },
);
