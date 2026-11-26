import type { CDPSession, Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import {
  BOOK_ID,
  BOOK_TITLE,
  PAGE_COUNT,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  pageDrawnAtRest,
  pageIndexOf,
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
const JPEG_QUALITY = 0.92;
const CPU_SLOWDOWN = 4;
const QUICK_TAPS = 4;
const TAP_GAP_MS = 120;
const FRAMES_TO_SETTLE = 7;
const FRAMES_BETWEEN_DOUBLE_TAPS = 2;
const FRAMES_FOR_A_SCROLL = 2;
const COVER_SAMPLES = 20;
const PAN_ACROSS_PX = -120;
const PAN_DOWN_PX = -120;
const PAN_PAST_EDGE_PX = 3000;
const DRAG_STEPS = 12;
const CLOSE_PX = 4;
const LONG_BOOK_PAGES = 200;
const KEY_REPEAT_MS = 30;
const HELD_KEY_MS = 2000;
const TAP_BURST = 12;
const TAP_BURST_GAP_MS = 40;
const MOST_CELLS_DRAWN = 3;
const MOST_PAGES_HELD = 7;
const ARROW_RIGHT = {
  key: "ArrowRight",
  code: "ArrowRight",
  windowsVirtualKeyCode: 39,
};

test.use({ backend: readerBackend(DEFAULT_BACKEND, OPENING) });

test.skip(
  ({ browserName, isMobile }) => browserName !== "chromium" || !isMobile,
  "real touches go through Chromium's DevTools protocol on a touch screen",
);

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PagesHeld {
  readonly mostDrawn: number;
  readonly mostMounted: number;
}

declare global {
  interface Window {
    omnileafGappedFrames?: number[];
    omnileafRecording?: boolean;
    omnileafControlsShown?: boolean;
    omnileafPagesHeld?: { mostDrawn: number; mostMounted: number };
  }
}

async function largeNoisePage(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    async ({ width, height, quality }) => {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("no 2d canvas to draw a large page");
      }
      const pixels = context.createImageData(width, height);
      const chunk = 65_536;
      for (let start = 0; start < pixels.data.length; start += chunk) {
        crypto.getRandomValues(
          pixels.data.subarray(
            start,
            Math.min(start + chunk, pixels.data.length),
          ),
        );
      }
      context.putImageData(pixels, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("read the large page as text"));
          }
        };
        reader.onerror = () => {
          reject(new Error("read the large page"));
        };
        reader.readAsDataURL(blob);
      });
    },
    { width: PAGE_WIDTH, height: PAGE_HEIGHT, quality: JPEG_QUALITY },
  );
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

async function serveLargePages(page: Page): Promise<void> {
  const jpeg = await largeNoisePage(page);
  await servePages(page);
  await page.route(fakeProtocolRoute("omni"), async (route) => {
    if (pageIndexOf(route.request().url()) === undefined) {
      await route.fallback();
      return;
    }
    await route.fulfill({ contentType: "image/jpeg", body: jpeg });
  });
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

async function pageNumber(page: Page): Promise<number> {
  const said = await page
    .getByRole("slider", { name: "Page" })
    .getAttribute("aria-valuetext");
  return Number(/Page (\d+)/.exec(said ?? "")?.[1]);
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

async function tapEvery(
  session: CDPSession,
  at: Point,
  { taps, gapMs }: { taps: number; gapMs: number },
): Promise<void> {
  const start = Date.now();
  for (let index = 0; index < taps; index += 1) {
    const due = start + index * gapMs - Date.now();
    if (due > 0) {
      await new Promise((ready) => setTimeout(ready, due));
    }
    await tap(session, at);
  }
}

async function holdKey(
  session: CDPSession,
  key: typeof ARROW_RIGHT,
  forMs: number,
): Promise<void> {
  const start = Date.now();
  let presses = 0;
  while (Date.now() - start < forMs) {
    await session.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      ...key,
      autoRepeat: presses > 0,
    });
    presses += 1;
    const due = start + presses * KEY_REPEAT_MS - Date.now();
    if (due > 0) {
      await new Promise((ready) => setTimeout(ready, due));
    }
  }
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
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

async function recordUncoveredFrames(page: Page): Promise<void> {
  await page.evaluate((samples) => {
    window.omnileafGappedFrames = [];
    window.omnileafRecording = true;
    const isDrawn = (image: HTMLImageElement): boolean =>
      image.complete &&
      image.naturalWidth > 0 &&
      image.checkVisibility({ visibilityProperty: true });
    const record = (): void => {
      if (window.omnileafRecording !== true) {
        return;
      }
      const area = document
        .querySelector("[data-shown-page]")
        ?.getBoundingClientRect();
      if (area !== undefined) {
        const drawn = [
          ...new Set(
            [
              ...document.querySelectorAll<HTMLImageElement>(
                'main img[alt^="Page "]',
              ),
            ].flatMap((image) => image.parentElement?.parentElement ?? []),
          ),
        ].filter(
          (cell) =>
            cell.checkVisibility({ visibilityProperty: true }) &&
            [...cell.querySelectorAll("img")].every(isDrawn),
        );
        const gaps = Array.from(
          { length: samples },
          (_, step) => area.left + ((step + 0.5) * area.width) / samples,
        ).filter(
          (x) =>
            !drawn.some((cell) => {
              const box = cell.getBoundingClientRect();
              return box.left <= x && x <= box.right;
            }),
        ).length;
        window.omnileafGappedFrames?.push(gaps);
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  }, COVER_SAMPLES);
}

async function stopRecording(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    window.omnileafRecording = false;
    return window.omnileafGappedFrames ?? [];
  });
}

async function recordPagesHeld(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.omnileafPagesHeld = { mostDrawn: 0, mostMounted: 0 };
    window.omnileafRecording = true;
    const record = (): void => {
      if (window.omnileafRecording !== true) {
        return;
      }
      const images = [
        ...document.querySelectorAll<HTMLImageElement>(
          'main img[alt^="Page "]',
        ),
      ];
      const cells = new Set(
        images.flatMap((image) => image.parentElement?.parentElement ?? []),
      );
      const drawn = [...cells].filter((cell) =>
        cell.checkVisibility({ visibilityProperty: true }),
      ).length;
      const held = window.omnileafPagesHeld;
      if (held !== undefined) {
        held.mostDrawn = Math.max(held.mostDrawn, drawn);
        held.mostMounted = Math.max(held.mostMounted, images.length);
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}

async function stopRecordingPagesHeld(page: Page): Promise<PagesHeld> {
  return page.evaluate(() => {
    window.omnileafRecording = false;
    return window.omnileafPagesHeld ?? { mostDrawn: 0, mostMounted: 0 };
  });
}

async function slidesRunning(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
  );
}

async function watchForControls(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.omnileafControlsShown = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-reader-resting-count]") === null) {
        window.omnileafControlsShown = true;
      }
    }).observe(document.body, { childList: true, subtree: true });
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
  return box;
}

async function pageAreaBox(page: Page): Promise<Point> {
  const box = await page.locator("[data-shown-page]").boundingBox();
  if (box === null) {
    throw new Error("the page area is not on screen");
  }
  return box;
}

test(
  "keeps the screen covered by drawn pages through four quick taps on a slow phone",
  { tag: "@native" },
  async ({ page }) => {
    await serveLargePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    await expect(
      page.getByRole("main").locator('img[alt="Page 17"]'),
    ).not.toHaveClass(/invisible/, { timeout: 15_000 });
    const session = await page.context().newCDPSession(page);
    const next = await centreOf(
      page.getByRole("button", { name: "Next page" }),
    );
    await session.send("Emulation.setCPUThrottlingRate", {
      rate: CPU_SLOWDOWN,
    });
    await recordUncoveredFrames(page);

    await tapEvery(session, next, { taps: QUICK_TAPS, gapMs: TAP_GAP_MS });
    await expectOnPage(page, 14 + QUICK_TAPS);
    await expect.poll(() => slidesRunning(page)).toBe(0);
    await waitFrames(page, FRAMES_TO_SETTLE);
    const gapped = await stopRecording(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    expect(gapped.length).toBeGreaterThan(0);
    expect(gapped.filter((gaps) => gaps > 0)).toEqual([]);
  },
);

test(
  "zooms on a double tap without showing the controls first",
  { tag: "@native" },
  async ({ page }) => {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await hideControls(page, session);
    await watchForControls(page);

    await doubleTapToZoom(page, session);

    expect(
      await page.evaluate(() => window.omnileafControlsShown ?? false),
    ).toBe(false);
  },
);

test.describe("a long book", { tag: "@native" }, () => {
  test.use({
    backend: {
      ...DEFAULT_BACKEND,
      openBook: () => readerBook(OPENING, LONG_BOOK_PAGES),
    },
  });

  async function expectPagesKeptUp(
    page: Page,
    turn: (session: CDPSession) => Promise<void>,
  ): Promise<void> {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await recordPagesHeld(page);

    await turn(session);
    await expect.poll(() => slidesRunning(page)).toBe(0);
    await waitFrames(page, FRAMES_TO_SETTLE);
    const held = await stopRecordingPagesHeld(page);

    expect(held.mostDrawn).toBeLessThanOrEqual(MOST_CELLS_DRAWN);
    expect(held.mostMounted).toBeLessThanOrEqual(MOST_PAGES_HELD);
    expect(await pageNumber(page)).toBeGreaterThan(14);
    expect(await pageDrawnAtRest(page)).toBe(await pageNumber(page));
  }

  test("keeps at most three pages drawn, and the page drawn on its number, while a key is held", async ({
    page,
  }) => {
    await expectPagesKeptUp(page, (session) =>
      holdKey(session, ARROW_RIGHT, HELD_KEY_MS),
    );
  });

  test("keeps at most three pages drawn, and the page drawn on its number, through a burst of taps", async ({
    page,
  }) => {
    await expectPagesKeptUp(page, async (session) => {
      const next = await centreOf(
        page.getByRole("button", { name: "Next page" }),
      );
      await tapEvery(session, next, {
        taps: TAP_BURST,
        gapMs: TAP_BURST_GAP_MS,
      });
    });
  });
});

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
