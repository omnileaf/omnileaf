import type { CDPSession, Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  PAGE_COUNT,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";

const LOOK_KEY = "omnileaf.readerSettings.all";
const GUIDES_SEEN = [
  "omnileaf.readerGuide.leftToRight",
  "omnileaf.readerGuide.rightToLeft",
];
const OPENING = {
  reading: { state: "started", page: 14 },
  startPage: 13,
} as const;
const FRAMES_BETWEEN_DOUBLE_TAPS = 2;
const FRAMES_FOR_A_SCROLL = 2;
const PAN_ACROSS_PX = -120;
const PAN_DOWN_PX = -120;
const PAN_PAST_EDGE_PX = 3000;
const DRAG_STEPS = 12;
const CLOSE_PX = 4;

test.use({ backend: readerBackend(DEFAULT_BACKEND, OPENING) });

test.skip(
  ({ browserName, isMobile }) => browserName !== "chromium" || !isMobile,
  "real touches go through Chromium's DevTools protocol on a touch screen",
);

interface Point {
  readonly x: number;
  readonly y: number;
}

async function openBookWith(page: Page, look: object): Promise<void> {
  await page.addInitScript(
    ({ key, value, guides }) => {
      localStorage.setItem(key, value);
      for (const guide of guides) {
        localStorage.setItem(guide, "seen");
      }
    },
    { key: LOOK_KEY, value: JSON.stringify(look), guides: GUIDES_SEEN },
  );
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: BOOK_TITLE }),
  ).toBeAttached();
  await expect(shownPage(page, 14)).toBeVisible();
}

function shownPage(page: Page, number: number): Locator {
  return page
    .getByRole("main")
    .getByRole("img", { name: `Page ${String(number)}`, exact: true });
}

async function expectOnPage(page: Page, number: number): Promise<void> {
  await expect(page.getByRole("slider", { name: "Page" })).toHaveAttribute(
    "aria-valuetext",
    `Page ${String(number)} of ${String(PAGE_COUNT)}`,
  );
}

async function centreOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("the control is not on screen");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function waitFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        let left = count;
        const next = (): void => {
          left -= 1;
          if (left <= 0) {
            done();
            return;
          }
          requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      }),
    frames,
  );
}

async function tap(session: CDPSession, at: Point): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [at],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function fingerDown(session: CDPSession, at: Point): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [at],
  });
}

async function moveFinger(
  session: CDPSession,
  from: Point,
  to: Point,
): Promise<void> {
  for (let step = 1; step <= DRAG_STEPS; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * step) / DRAG_STEPS,
          y: from.y + ((to.y - from.y) * step) / DRAG_STEPS,
        },
      ],
    });
  }
}

function movedBy(from: Point, by: Point): Point {
  return { x: from.x + by.x, y: from.y + by.y };
}

async function liftFinger(session: CDPSession): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function hideControls(page: Page, session: CDPSession): Promise<void> {
  await tap(
    session,
    await centreOf(page.getByRole("button", { name: "Hide the controls" })),
  );
  await expect(page.locator("[data-reader-resting-count]")).toBeVisible();
}

async function doubleTapToZoom(page: Page, session: CDPSession): Promise<void> {
  const middle = await centreOf(
    page.getByRole("button", { name: "Show the controls" }),
  );
  await tap(session, middle);
  await waitFrames(page, FRAMES_BETWEEN_DOUBLE_TAPS);
  await tap(session, middle);
  await expect(page.getByText("200%", { exact: false })).toBeVisible();
}

async function pageOffset(page: Page, number: number): Promise<Point> {
  await waitFrames(page, FRAMES_FOR_A_SCROLL);
  const box = await shownPage(page, number).boundingBox();
  if (box === null) {
    throw new Error("the page is not on screen");
  }
  return { x: box.x, y: box.y };
}

async function pageAreaBox(page: Page): Promise<Point> {
  const box = await page.locator("[data-shown-page]").boundingBox();
  if (box === null) {
    throw new Error("the page area is not on screen");
  }
  return { x: box.x, y: box.y };
}

async function expectZoomedPagePans(page: Page): Promise<void> {
  await servePages(page);
  await openBookWith(page, { pageTurn: "slide" });
  const session = await page.context().newCDPSession(page);
  await hideControls(page, session);
  await doubleTapToZoom(page, session);
  const middle = await centreOf(page.locator("[data-shown-page]"));
  const pan = { x: PAN_ACROSS_PX, y: PAN_DOWN_PX };
  const halfway = movedBy(middle, { x: pan.x / 2, y: pan.y / 2 });
  await fingerDown(session, middle);
  await moveFinger(session, middle, halfway);
  const before = await pageOffset(page, 14);

  await moveFinger(session, halfway, movedBy(middle, pan));
  const panned = await pageOffset(page, 14);
  await liftFinger(session);
  await fingerDown(session, middle);
  await moveFinger(
    session,
    middle,
    movedBy(middle, { x: PAN_PAST_EDGE_PX, y: PAN_PAST_EDGE_PX }),
  );
  const clamped = await pageOffset(page, 14);
  await liftFinger(session);

  expect(Math.abs(panned.x - (before.x + pan.x / 2))).toBeLessThan(CLOSE_PX);
  expect(Math.abs(panned.y - (before.y + pan.y / 2))).toBeLessThan(CLOSE_PX);
  const area = await pageAreaBox(page);
  expect(Math.abs(clamped.x - area.x)).toBeLessThan(CLOSE_PX);
  expect(Math.abs(clamped.y - area.y)).toBeLessThan(CLOSE_PX);
  await expectOnPage(page, 14);
}

test(
  "pans a page zoomed by a double tap both ways under the finger, stopping at its edges, without turning it",
  { tag: "@native" },
  async ({ page }) => {
    await expectZoomedPagePans(page);
  },
);

test.describe("a book read right to left", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...readerBackend(DEFAULT_BACKEND, OPENING),
      openBook: () => ({
        ...readerBook(OPENING),
        readingDirection: "rightToLeft",
      }),
    },
  });

  test("pans a page zoomed by a double tap both ways under the finger, stopping at its edges", async ({
    page,
  }) => {
    await expectZoomedPagePans(page);
  });
});
