import type { CDPSession, Locator, Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import {
  BOOK_ID,
  BOOK_SERIES_ID,
  BOOK_TITLE,
  NEXT_BOOK,
  NOT_STARTED,
  PAGE_COUNT,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  pageDrawnAtRest,
  pageIndexOf,
  readerBackend,
  readerBook,
  servePages,
} from "./reader-book.ts";
import { recordBarePages, stopRecordingBarePages } from "./reader-paint.ts";

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
const KEY_REPEATS = 60;
const FRAMES_PER_KEY_REPEAT = 2;
const FRAMES_BETWEEN_BURST_TAPS = 2;
const PAGE_ARRIVAL_MS = 300;
const TAP_BURST = 12;
const TAP_BURST_GAP_MS = 40;
const PAGES_READ_ON = 12;
const EVEN_TAP_GAP_MS = 160;
const MIDWAY_TAP_GAP_MS = 120;
const MIDWAY_CATCHES = 3;
const ALTERNATING_TAPS = 8;
const READ_AHEAD = [16, 17] as const;
const MOST_CELLS_DRAWN = 3;
const MOST_PAGES_HELD = 7;
const WAIT_PAST_DOUBLE_TAP_MS = 600;
const DOUBLE_TAP_GAPS_MS = [45, 256];
const LATE_SECOND_TAP_MS = 305;
const AFTER_THE_WINDOW_MS = 500;
const BEFORE_THE_WINDOW_ENDS_MS = 150;
const SHORT_DRAG_PX = -30;
const AWAY_FROM_THE_TAP = { x: 60, y: 160 };
const ARROW_RIGHT = {
  key: "ArrowRight",
  code: "ArrowRight",
  windowsVirtualKeyCode: 39,
};
const ARROW_LEFT = {
  key: "ArrowLeft",
  code: "ArrowLeft",
  windowsVirtualKeyCode: 37,
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

interface Box extends Point {
  readonly width: number;
  readonly height: number;
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
    omnileafMostPainted?: number;
    omnileafHeldPages?: HTMLImageElement[];
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

async function serveLargePages(
  page: Page,
  {
    arrivesAfterMs = 0,
    arrivesAgainAfterMs = arrivesAfterMs,
  }: { arrivesAfterMs?: number; arrivesAgainAfterMs?: number } = {},
): Promise<void> {
  const jpeg = await largeNoisePage(page);
  const served = new Set<number>();
  await servePages(page);
  await page.route(fakeProtocolRoute("omni"), async (route) => {
    const index = pageIndexOf(route.request().url());
    if (index === undefined) {
      await route.fallback();
      return;
    }
    const delayMs = served.has(index) ? arrivesAgainAfterMs : arrivesAfterMs;
    served.add(index);
    await new Promise((arrived) => setTimeout(arrived, delayMs));
    await route.fulfill({ contentType: "image/jpeg", body: jpeg });
  });
}

async function holdPages(
  page: Page,
  numbers: readonly number[],
): Promise<void> {
  await page.evaluate(
    (alts) => {
      window.omnileafHeldPages = alts.flatMap(
        (alt) =>
          document.querySelector<HTMLImageElement>(`main img[alt="${alt}"]`) ??
          [],
      );
    },
    numbers.map((number) => `Page ${String(number)}`),
  );
}

async function pagesStillHeld(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window.omnileafHeldPages ?? [])
      .filter((image) => image.isConnected)
      .map((image) => image.alt),
  );
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
  page: Page,
  session: CDPSession,
  key: typeof ARROW_RIGHT | typeof ARROW_LEFT,
): Promise<void> {
  for (let press = 0; press < KEY_REPEATS; press += 1) {
    await session.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      ...key,
      autoRepeat: press > 0,
    });
    await waitFrames(page, FRAMES_PER_KEY_REPEAT);
  }
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function tapBurst(
  page: Page,
  session: CDPSession,
  at: Point,
): Promise<void> {
  for (let taps = 0; taps < TAP_BURST; taps += 1) {
    await tap(session, at);
    await waitFrames(page, FRAMES_BETWEEN_BURST_TAPS);
  }
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
    const isPageLoadingShown = (image: HTMLImageElement): boolean =>
      image.parentElement
        ?.querySelector("[data-page-loading]")
        ?.checkVisibility({ visibilityProperty: true }) === true;
    const isDrawn = (image: HTMLImageElement): boolean =>
      (image.complete &&
        image.naturalWidth > 0 &&
        image.checkVisibility({ visibilityProperty: true })) ||
      isPageLoadingShown(image);
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
        const loading = document.querySelector('main [role="status"] p');
        const isLoadingShown =
          loading?.textContent.startsWith("Loading page") === true &&
          loading.checkVisibility({ visibilityProperty: true });
        window.omnileafGappedFrames?.push(isLoadingShown ? 0 : gaps);
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

async function waitPastDoubleTap(page: Page): Promise<void> {
  await page.evaluate(
    (ms) =>
      new Promise((past) => {
        setTimeout(past, ms);
      }),
    WAIT_PAST_DOUBLE_TAP_MS,
  );
}

async function controlsWereShown(page: Page): Promise<boolean> {
  return page.evaluate(() => window.omnileafControlsShown ?? false);
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

async function pageOffset(page: Page, number: number): Promise<Box> {
  await waitFrames(page, FRAMES_FOR_A_SCROLL);
  const box = await shownPage(page, number).boundingBox();
  if (box === null) {
    throw new Error("the page is not on screen");
  }
  return box;
}

async function pageAreaBox(page: Page): Promise<Box> {
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
    await expect.poll(() => pageDrawnAtRest(page)).toBe(14 + QUICK_TAPS);
  },
);

test(
  "covers the page area with a page or its loading state through a burst of taps onto pages still on their way",
  { tag: "@native" },
  async ({ page }) => {
    await serveLargePages(page, { arrivesAfterMs: PAGE_ARRIVAL_MS });
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    const next = await centreOf(
      page.getByRole("button", { name: "Next page" }),
    );
    await session.send("Emulation.setCPUThrottlingRate", {
      rate: CPU_SLOWDOWN,
    });
    await recordUncoveredFrames(page);

    await tapEvery(session, next, { taps: TAP_BURST, gapMs: TAP_BURST_GAP_MS });
    await expectOnPage(page, 14 + TAP_BURST);
    await expect.poll(() => slidesRunning(page)).toBe(0);
    await waitFrames(page, FRAMES_TO_SETTLE);
    const gapped = await stopRecording(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });

    expect(gapped.length).toBeGreaterThan(0);
    expect(gapped.filter((gaps) => gaps > 0)).toEqual([]);
  },
);

interface Burst {
  readonly taps: number;
  readonly gapMs: number;
}

async function barePagesTurningBack(
  page: Page,
  bursts: readonly Burst[],
): Promise<string[]> {
  await serveLargePages(page, { arrivesAgainAfterMs: PAGE_ARRIVAL_MS });
  await openBookWith(page, { pageTurn: "slide" });
  await expect(
    page.getByRole("main").locator('img[alt="Page 17"]'),
  ).not.toHaveClass(/invisible/, { timeout: 15_000 });
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  const next = await centreOf(page.getByRole("button", { name: "Next page" }));
  const previous = await centreOf(
    page.getByRole("button", { name: "Previous page" }),
  );
  await tapEvery(session, next, {
    taps: PAGES_READ_ON,
    gapMs: EVEN_TAP_GAP_MS,
  });
  await expectOnPage(page, 14 + PAGES_READ_ON);
  await expect.poll(() => slidesRunning(page)).toBe(0);
  await expect.poll(() => pageDrawnAtRest(page)).toBe(14 + PAGES_READ_ON);
  await session.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  await recordBarePages(page);

  let shown = 14 + PAGES_READ_ON;
  for (const burst of bursts) {
    await tapEvery(session, previous, burst);
    shown -= burst.taps;
    await expectOnPage(page, shown);
    await expect.poll(() => slidesRunning(page)).toBe(0);
    await waitFrames(page, FRAMES_TO_SETTLE);
  }
  const bare = await stopRecordingBarePages(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await expect.poll(() => pageDrawnAtRest(page)).toBe(shown);
  return bare;
}

test(
  "paints each page placed on screen or its loading state through taps back at an even pace",
  { tag: "@native" },
  async ({ page }) => {
    const bursts = [{ taps: PAGES_READ_ON, gapMs: EVEN_TAP_GAP_MS }];

    const bare = await barePagesTurningBack(page, bursts);

    expect(bare).toEqual([]);
  },
);

test(
  "paints each page placed on screen or its loading state through a burst of taps back that cuts",
  { tag: "@native" },
  async ({ page }) => {
    const bursts = [{ taps: PAGES_READ_ON, gapMs: TAP_BURST_GAP_MS }];

    const bare = await barePagesTurningBack(page, bursts);

    expect(bare).toEqual([]);
  },
);

test(
  "paints each page placed on screen or its loading state when a slide back is caught mid-way",
  { tag: "@native" },
  async ({ page }) => {
    const bursts = Array.from({ length: MIDWAY_CATCHES }, () => ({
      taps: 2,
      gapMs: MIDWAY_TAP_GAP_MS,
    }));

    const bare = await barePagesTurningBack(page, bursts);

    expect(bare).toEqual([]);
  },
);

test(
  "keeps the pages read ahead through taps back and forth",
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
    const previous = await centreOf(
      page.getByRole("button", { name: "Previous page" }),
    );
    await holdPages(page, READ_AHEAD);

    for (let turn = 0; turn < ALTERNATING_TAPS; turn += 1) {
      const isForward = turn % 2 === 0;
      await tap(session, isForward ? next : previous);
      await expectOnPage(page, isForward ? 15 : 14);
      await expect.poll(() => slidesRunning(page)).toBe(0);
      await waitFrames(page, FRAMES_TO_SETTLE);
    }

    expect(await pagesStillHeld(page)).toEqual(
      READ_AHEAD.map((number) => `Page ${String(number)}`),
    );
  },
);

test(
  "zooms on a pen's double tap without showing the controls first",
  { tag: "@native" },
  async ({ page }) => {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await hideControls(page, session);
    await watchForControls(page);
    const middle = await centreOf(
      page.getByRole("button", { name: "Show the controls" }),
    );

    for (const clickCount of [1, 2]) {
      for (const type of ["mousePressed", "mouseReleased"] as const) {
        await session.send("Input.dispatchMouseEvent", {
          type,
          ...middle,
          button: "left",
          clickCount,
          pointerType: "pen",
        });
      }
    }
    await expect(page.getByText("200%", { exact: false })).toBeVisible();
    await waitPastDoubleTap(page);

    expect(await controlsWereShown(page)).toBe(false);
  },
);

interface ScriptedTaps {
  readonly pointerType: string;
  readonly gapAfterLiftMs: number;
  readonly isDoubleTap: boolean;
}

async function tapTheMiddleTwice(
  page: Page,
  { pointerType, gapAfterLiftMs, isDoubleTap }: ScriptedTaps,
): Promise<void> {
  await page.evaluate(
    async ({ type, gap, isDouble }) => {
      const middle = [
        ...document.querySelectorAll<HTMLElement>("[data-tap-zones] button"),
      ].find((zone) =>
        /the controls$/.test(zone.getAttribute("aria-label") ?? ""),
      );
      if (middle === undefined) {
        throw new Error("the middle of the page is not on screen");
      }
      const box = middle.getBoundingClientRect();
      const at = {
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        bubbles: true,
        cancelable: true,
        composed: true,
      };
      const touch = { bubbles: true, cancelable: true, composed: true };
      const tapOnce = (detail: number): void => {
        middle.dispatchEvent(
          new PointerEvent("pointerdown", {
            ...at,
            pointerType: type,
            pointerId: 1,
            isPrimary: true,
          }),
        );
        middle.dispatchEvent(new TouchEvent("touchstart", touch));
        middle.dispatchEvent(
          new PointerEvent("pointerup", {
            ...at,
            pointerType: type,
            pointerId: 1,
            isPrimary: true,
          }),
        );
        middle.dispatchEvent(new TouchEvent("touchend", touch));
        middle.dispatchEvent(new MouseEvent("click", { ...at, detail }));
      };
      tapOnce(1);
      await new Promise((due) => setTimeout(due, gap));
      tapOnce(isDouble ? 2 : 1);
      if (isDouble) {
        middle.dispatchEvent(new MouseEvent("dblclick", { ...at, detail: 2 }));
      }
    },
    { type: pointerType, gap: gapAfterLiftMs, isDouble: isDoubleTap },
  );
}

async function areControlsShown(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.querySelector("[data-reader-resting-count]") === null,
  );
}

async function tapTheMiddleOnceAs(
  page: Page,
  pointerType: string,
): Promise<void> {
  await page.evaluate((type) => {
    const middle = [
      ...document.querySelectorAll<HTMLElement>("[data-tap-zones] button"),
    ].find((zone) =>
      /the controls$/.test(zone.getAttribute("aria-label") ?? ""),
    );
    if (middle === undefined) {
      throw new Error("the middle of the page is not on screen");
    }
    const box = middle.getBoundingClientRect();
    const at = {
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2,
      bubbles: true,
      cancelable: true,
      composed: true,
    };
    const pointer = { ...at, pointerType: type, pointerId: 1, isPrimary: true };
    middle.dispatchEvent(new PointerEvent("pointerdown", pointer));
    middle.dispatchEvent(new PointerEvent("pointerup", pointer));
    middle.dispatchEvent(new MouseEvent("click", { ...at, detail: 1 }));
  }, pointerType);
}

async function waitInPage(page: Page, ms: number): Promise<void> {
  await page.evaluate(
    (wait) =>
      new Promise((done) => {
        setTimeout(done, wait);
      }),
    ms,
  );
}

const DEVICE_DOUBLE_TAPS = [
  ...DOUBLE_TAP_GAPS_MS.map((gapAfterLiftMs) => ({
    pointerType: "",
    gapAfterLiftMs,
  })),
  { pointerType: "touch", gapAfterLiftMs: LATE_SECOND_TAP_MS },
];

for (const { pointerType, gapAfterLiftMs } of DEVICE_DOUBLE_TAPS) {
  test(
    `zooms on a double tap of type "${pointerType}" ${String(gapAfterLiftMs)} ms apart without showing the controls`,
    { tag: "@native" },
    async ({ page }) => {
      await servePages(page);
      await openBookWith(page, { pageTurn: "slide" });
      const session = await page.context().newCDPSession(page);
      await hideControls(page, session);
      await watchForControls(page);

      await tapTheMiddleTwice(page, {
        pointerType,
        gapAfterLiftMs,
        isDoubleTap: true,
      });
      await waitPastDoubleTap(page);

      await expect(page.getByText("200%", { exact: false })).toBeVisible();
      expect(await controlsWereShown(page)).toBe(false);
    },
  );
}

for (const gapMs of DOUBLE_TAP_GAPS_MS) {
  test(
    `zooms on a real double tap ${String(gapMs)} ms apart without showing the controls`,
    { tag: "@native" },
    async ({ page }) => {
      await servePages(page);
      await openBookWith(page, { pageTurn: "slide" });
      const session = await page.context().newCDPSession(page);
      await hideControls(page, session);
      await watchForControls(page);
      const middle = await centreOf(
        page.getByRole("button", { name: "Show the controls" }),
      );

      await tapEvery(session, middle, { taps: 2, gapMs });
      await waitPastDoubleTap(page);

      await expect(page.getByText("200%", { exact: false })).toBeVisible();
      expect(await controlsWereShown(page)).toBe(false);
    },
  );
}

test(
  "takes a second tap after the double tap's window as a tap of its own",
  { tag: "@native" },
  async ({ page }) => {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await hideControls(page, session);

    await tapTheMiddleOnceAs(page, "");
    await waitInPage(page, AFTER_THE_WINDOW_MS);
    const afterTheFirst = await areControlsShown(page);
    await tapTheMiddleOnceAs(page, "");
    await waitInPage(page, AFTER_THE_WINDOW_MS);

    expect(afterTheFirst).toBe(true);
    expect(await areControlsShown(page)).toBe(false);
    await expect(page.getByText("200%", { exact: false })).toBeHidden();
  },
);

test(
  "waits out the double tap's window before a tap of no named type shows the controls",
  { tag: "@native" },
  async ({ page }) => {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await hideControls(page, session);

    await tapTheMiddleOnceAs(page, "");
    await waitInPage(page, BEFORE_THE_WINDOW_ENDS_MS);
    const early = await areControlsShown(page);
    await waitInPage(page, AFTER_THE_WINDOW_MS);

    expect(early).toBe(false);
    expect(await areControlsShown(page)).toBe(true);
  },
);

test(
  "shows the controls at once for a mouse click and for Enter on the middle of the page",
  { tag: "@native" },
  async ({ page }) => {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await hideControls(page, session);

    await tapTheMiddleOnceAs(page, "mouse");
    const afterTheClick = await areControlsShown(page);
    await page.getByRole("button", { name: "Hide the controls" }).focus();
    await page.keyboard.press("Enter");
    const afterEnter = await areControlsShown(page);

    expect(afterTheClick).toBe(true);
    expect(afterEnter).toBe(false);
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
    await waitPastDoubleTap(page);

    expect(await controlsWereShown(page)).toBe(false);
  },
);

test(
  "drops a tap waiting on the middle once a turn follows it",
  { tag: "@native" },
  async ({ page }) => {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await hideControls(page, session);
    await watchForControls(page);
    const middle = await centreOf(
      page.getByRole("button", { name: "Show the controls" }),
    );
    const next = await centreOf(
      page.getByRole("button", { name: "Next page" }),
    );

    await tap(session, middle);
    await tap(session, next);
    await waitPastDoubleTap(page);

    expect(await controlsWereShown(page)).toBe(false);
    await expectOnPage(page, 15);
  },
);

test(
  "drops a tap waiting on the middle once a drag starts",
  { tag: "@native" },
  async ({ page }) => {
    await servePages(page);
    await openBookWith(page, { pageTurn: "slide" });
    const session = await page.context().newCDPSession(page);
    await hideControls(page, session);
    await watchForControls(page);
    const middle = await centreOf(
      page.getByRole("button", { name: "Show the controls" }),
    );

    const dragStart = movedBy(middle, AWAY_FROM_THE_TAP);
    await tap(session, middle);
    await fingerDown(session, dragStart);
    await moveFinger(
      session,
      dragStart,
      movedBy(dragStart, { x: SHORT_DRAG_PX, y: 0 }),
    );
    await liftFinger(session);
    await waitPastDoubleTap(page);

    expect(await controlsWereShown(page)).toBe(false);
    await expectOnPage(page, 14);
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
    const number = await pageNumber(page);
    await expect.poll(() => pageDrawnAtRest(page)).toBe(number);
  }

  test("keeps at most three pages drawn, and the page drawn on its number, while a key is held", async ({
    page,
  }) => {
    await expectPagesKeptUp(page, (session) =>
      holdKey(page, session, ARROW_RIGHT),
    );
  });

  test("keeps at most three pages drawn, and the page drawn on its number, through a burst of taps", async ({
    page,
  }) => {
    await expectPagesKeptUp(page, async (session) => {
      const next = await centreOf(
        page.getByRole("button", { name: "Next page" }),
      );
      await tapBurst(page, session, next);
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
  await fingerDown(session, middle);
  await moveFinger(
    session,
    middle,
    movedBy(middle, { x: -PAN_PAST_EDGE_PX, y: -PAN_PAST_EDGE_PX }),
  );
  const farEdge = await pageOffset(page, 14);
  await liftFinger(session);

  expect(Math.abs(panned.x - (before.x + pan.x / 2))).toBeLessThan(CLOSE_PX);
  expect(Math.abs(panned.y - (before.y + pan.y / 2))).toBeLessThan(CLOSE_PX);
  const area = await pageAreaBox(page);
  expect(Math.abs(clamped.x - area.x)).toBeLessThan(CLOSE_PX);
  expect(Math.abs(clamped.y - area.y)).toBeLessThan(CLOSE_PX);
  expect(
    Math.abs(farEdge.x + farEdge.width - (area.x + area.width)),
  ).toBeLessThan(CLOSE_PX);
  expect(
    Math.abs(farEdge.y + farEdge.height - (area.y + area.height)),
  ).toBeLessThan(CLOSE_PX);
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

test.describe("at the end of a book", { tag: "@native" }, () => {
  const THREE_BEFORE_THE_END = {
    reading: { state: "started", page: PAGE_COUNT - 3 },
    startPage: PAGE_COUNT - 4,
  } as const;
  const ON_THE_LAST_PAGE = {
    reading: { state: "started", page: PAGE_COUNT },
    startPage: PAGE_COUNT - 1,
  } as const;
  const NEXT_BOOK_PAGE = new RegExp(`/read/${NEXT_BOOK.id}$`);
  const SERIES_PAGE = new RegExp(`/series/${BOOK_SERIES_ID}$`);
  const SKIP_UP_NEXT_KEY = "omnileaf.skipUpNext";
  const FINISHED = `${BOOK_TITLE} finished`;
  const ZOOMED_DRAG_PX = -150;

  async function openNear(
    page: Page,
    shownFirst: number,
    stored: Record<string, string> = {},
  ): Promise<void> {
    await page.addInitScript(
      ({ key, value, guides, entries }) => {
        localStorage.setItem(key, value);
        for (const guide of [...guides, ...Object.keys(entries)]) {
          localStorage.setItem(guide, entries[guide] ?? "seen");
        }
      },
      {
        key: LOOK_KEY,
        value: JSON.stringify({ pageTurn: "slide" }),
        guides: GUIDES_SEEN,
        entries: stored,
      },
    );
    await servePages(page);
    await page.goto(`/read/${BOOK_ID}`);
    await expect(shownPage(page, shownFirst)).toBeVisible();
  }

  async function recordMostPainted(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.omnileafMostPainted = 0;
      window.omnileafRecording = true;
      const record = (): void => {
        if (window.omnileafRecording !== true) {
          return;
        }
        const painted = document.querySelectorAll("main [data-turns]").length;
        window.omnileafMostPainted = Math.max(
          window.omnileafMostPainted ?? 0,
          painted,
        );
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });
  }

  async function stopRecordingMostPainted(page: Page): Promise<number> {
    return page.evaluate(() => {
      window.omnileafRecording = false;
      return window.omnileafMostPainted ?? 0;
    });
  }

  async function holdToTheEnd(page: Page): Promise<number> {
    const session = await page.context().newCDPSession(page);
    await recordMostPainted(page);
    await holdKey(page, session, ARROW_RIGHT);
    await expect.poll(() => slidesRunning(page)).toBe(0);
    await waitFrames(page, FRAMES_TO_SETTLE);
    return stopRecordingMostPainted(page);
  }

  test.describe("held at three pages before it", () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        openBook: (id) => ({
          ...readerBook(id === BOOK_ID ? THREE_BEFORE_THE_END : NOT_STARTED),
          id,
        }),
      },
    });

    test("ends a held key at rest on Up next, never painting more than three pages", async ({
      page,
    }) => {
      await openNear(page, PAGE_COUNT - 3);

      const mostPainted = await holdToTheEnd(page);

      expect(mostPainted).toBeLessThanOrEqual(MOST_CELLS_DRAWN);
      await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
      await expect(
        page.getByRole("heading", { level: 2, name: FINISHED }),
      ).toBeVisible();
      expect(
        await page
          .locator("main [data-turns]")
          .evaluateAll((cells) =>
            cells.map((cell) => cell.getAttribute("data-turns")),
          ),
      ).toEqual(["0"]);
    });

    test("ends a held key at rest on the next book's first page with Skip Up next on", async ({
      page,
    }) => {
      await openNear(page, PAGE_COUNT - 3, { [SKIP_UP_NEXT_KEY]: "on" });

      const mostPainted = await holdToTheEnd(page);

      expect(mostPainted).toBeLessThanOrEqual(MOST_CELLS_DRAWN);
      await expect(page).toHaveURL(NEXT_BOOK_PAGE);
      await expect(shownPage(page, 1)).toBeVisible();
      await waitFrames(page, FRAMES_TO_SETTLE);
      expect(await pageNumber(page)).toBe(1);
    });
  });

  test.describe("held back from a few pages in", () => {
    const FOUR_PAGES_IN = {
      reading: { state: "started", page: 4 },
      startPage: 3,
    } as const;

    test.use({ backend: readerBackend(DEFAULT_BACKEND, FOUR_PAGES_IN) });

    test("ends a held key at rest on the first page, not in the book before", async ({
      page,
    }) => {
      await openNear(page, 4);
      const session = await page.context().newCDPSession(page);

      await holdKey(page, session, ARROW_LEFT);
      await expect.poll(() => slidesRunning(page)).toBe(0);
      await waitFrames(page, FRAMES_TO_SETTLE);

      await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}$`));
      expect(await pageNumber(page)).toBe(1);
    });
  });

  test.describe("on Up next", () => {
    const QUICKER_THAN_A_DOUBLE_TAP_MS = 150;

    test.use({ backend: readerBackend(DEFAULT_BACKEND, ON_THE_LAST_PAGE) });

    async function openUpNext(page: Page): Promise<CDPSession> {
      await openNear(page, PAGE_COUNT);
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByRole("heading", { level: 2, name: FINISHED }),
      ).toBeVisible();
      await expect.poll(() => slidesRunning(page)).toBe(0);
      return page.context().newCDPSession(page);
    }

    async function dragFrom(
      page: Page,
      session: CDPSession,
      start: Locator,
    ): Promise<void> {
      const from = await centreOf(start);
      await fingerDown(session, from);
      await moveFinger(
        session,
        from,
        movedBy(from, { x: ZOOMED_DRAG_PX, y: 0 }),
      );
      await liftFinger(session);
      await expect.poll(() => slidesRunning(page)).toBeLessThanOrEqual(1);
    }

    test("turns on with a touch drag that starts on its card", async ({
      page,
    }) => {
      const session = await openUpNext(page);

      await dragFrom(
        page,
        session,
        page.getByRole("heading", { level: 2, name: "Up next" }),
      );

      await expect(page).toHaveURL(NEXT_BOOK_PAGE);
    });

    test("turns on rather than presses a button a touch drag starts on", async ({
      page,
    }) => {
      const session = await openUpNext(page);

      await dragFrom(
        page,
        session,
        page.getByRole("link", { name: "Back to the series" }),
      );

      await expect(page).toHaveURL(NEXT_BOOK_PAGE);
    });

    test("presses a button on a touch tap", async ({ page }) => {
      const session = await openUpNext(page);

      await tap(
        session,
        await centreOf(page.getByRole("link", { name: "Back to the series" })),
      );

      await expect(page).toHaveURL(SERIES_PAGE);
    });

    test("does not zoom on a double tap", async ({ page }) => {
      const session = await openUpNext(page);
      const blank = await page.evaluate(() => {
        const x = window.innerWidth / 2;
        for (let y = window.innerHeight - 1; y > 0; y -= 1) {
          const name = document
            .elementFromPoint(x, y)
            ?.getAttribute("aria-label");
          if (name === "Show the controls" || name === "Hide the controls") {
            return { x, y };
          }
        }
        throw new Error("Up next leaves no room to tap its page");
      });

      await tap(session, blank);
      await waitFrames(page, FRAMES_BETWEEN_DOUBLE_TAPS);
      await tap(session, blank);
      await waitPastDoubleTap(page);

      await expect(page.getByText("200%", { exact: false })).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 2, name: FINISHED }),
      ).toBeVisible();
    });

    test("presses a button at once on a tap, without waiting out a double tap", async ({
      page,
    }) => {
      const session = await openUpNext(page);
      const back = page.getByRole("link", { name: "Back to the series" });
      await back.evaluate((link) => {
        link.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            link.dataset.pressedAfter = String(
              performance.now() - Number(link.dataset.liftedAt),
            );
          },
          { capture: true },
        );
        link.addEventListener("pointerup", () => {
          link.dataset.liftedAt = String(performance.now());
        });
      });

      await tap(session, await centreOf(back));

      await expect(back).toHaveAttribute("data-pressed-after");
      expect(
        Number(await back.getAttribute("data-pressed-after")),
      ).toBeLessThan(QUICKER_THAN_A_DOUBLE_TAP_MS);
    });
  });

  test.describe("zoomed on its last page", () => {
    test.use({ backend: readerBackend(DEFAULT_BACKEND, ON_THE_LAST_PAGE) });

    test("pans rather than brings Up next in on a drag", async ({ page }) => {
      await openNear(page, PAGE_COUNT);
      const session = await page.context().newCDPSession(page);
      await hideControls(page, session);
      await doubleTapToZoom(page, session);
      const upNext = page.locator("[data-up-next]");
      const middle = await centreOf(page.locator("[data-shown-page]"));

      await fingerDown(session, middle);
      await moveFinger(
        session,
        middle,
        movedBy(middle, { x: ZOOMED_DRAG_PX, y: 0 }),
      );
      const isInViewMidDrag = await upNext.evaluate((element) =>
        element.checkVisibility({ visibilityProperty: true }),
      );
      await liftFinger(session);
      await expect.poll(() => slidesRunning(page)).toBe(0);

      expect(isInViewMidDrag).toBe(false);
      await expect(
        page.getByRole("heading", { level: 2, name: FINISHED }),
      ).toBeHidden();
      await expectOnPage(page, PAGE_COUNT);
    });
  });
});
