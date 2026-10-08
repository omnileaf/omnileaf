import type { Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
  type LibraryView,
} from "../../src/lib/ipc/bindings.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const TEN_THOUSAND = 10_000;
const FRAMES = 300;
const SCROLL_PER_FRAME_PX = 40;
const FRAME_BUDGET_MS = 1000 / 60;
/** A frame this long missed the screen's next refresh, which at 60 Hz comes every 16.7 ms. */
const DROPPED_FRAME_MS = FRAME_BUDGET_MS * 1.5;
const MOST_DROPPED_FRAMES = 3;
const TIMED_PASSES = 3;

const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;

const CATALOG = sampleSeries(TEN_THOUSAND).map((series, index) => ({
  ...series,
  cover: `thumb/v1/0190a3e4-0000-8000-8000-000000000001/${String(index + 1)}/1`,
}));

let storedView: LibraryView = DEFAULT_LIBRARY_VIEW;

test.beforeEach(async ({ page }) => {
  await page.route(fakeProtocolRoute("omni"), (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: COVER_IMAGE }),
  );
});

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => CATALOG),
    libraryView: () => storedView,
  },
});

interface Scrolled {
  readonly framesPerSecond: number;
  readonly droppedFrames: number;
}

/** Scrolls the page a step each frame and times every frame it took. */
function scrollFrameByFrame(
  page: Page,
  frames: number,
  stepPx: number,
): Promise<readonly number[]> {
  return page.evaluate(
    ([count, step]) =>
      new Promise<number[]>((resolve) => {
        const main = document.querySelector("main");
        const intervals: number[] = [];
        let last: number | undefined;
        const frame = (now: number): void => {
          if (last !== undefined) {
            intervals.push(now - last);
          }
          last = now;
          main?.scrollBy(0, step);
          if (intervals.length < count) {
            requestAnimationFrame(frame);
          } else {
            resolve(intervals);
          }
        };
        requestAnimationFrame(frame);
      }),
    [frames, stepPx] as const,
  );
}

async function scrollOnce(page: Page): Promise<Scrolled> {
  await page.evaluate(() => document.querySelector("main")?.scrollTo(0, 0));
  const intervals = await scrollFrameByFrame(page, FRAMES, SCROLL_PER_FRAME_PX);

  const elapsed = intervals.reduce((sum, interval) => sum + interval, 0);
  return {
    framesPerSecond: (intervals.length * 1000) / elapsed,
    droppedFrames: intervals.filter((interval) => interval > DROPPED_FRAME_MS)
      .length,
  };
}

/** A stall on a shared runner only adds dropped frames, so the pass that dropped the fewest is the closest to the real cost. */
function smoothest(passes: readonly Scrolled[]): Scrolled {
  return passes.reduce((best, pass) =>
    pass.droppedFrames < best.droppedFrames ? pass : best,
  );
}

async function scrollThrough(
  page: Page,
  display: LibraryDisplay,
): Promise<readonly Scrolled[]> {
  storedView = { ...DEFAULT_LIBRARY_VIEW, display };
  await page.goto("/");
  await expect(
    page.getByRole("list", { name: "Series" }).getByRole("listitem").first(),
  ).toBeVisible();

  await scrollOnce(page);
  const passes: Scrolled[] = [];
  for (let pass = 0; pass < TIMED_PASSES; pass += 1) {
    passes.push(await scrollOnce(page));
  }
  return passes;
}

for (const display of ["grid", "compact", "list"] as const) {
  test(`scrolls the first ${String(FRAMES * SCROLL_PER_FRAME_PX)} px of the ${display} of ten thousand series dropping at most ${String(MOST_DROPPED_FRAMES)} of ${String(FRAMES)} frames`, async ({
    page,
  }) => {
    const passes = await scrollThrough(page, display);
    const scrolled = smoothest(passes);

    test.info().annotations.push({
      type: "scrolling",
      description: `fewest dropped of ${String(passes.length)} passes: ${scrolled.framesPerSecond.toFixed(1)} fps, ${String(scrolled.droppedFrames)} of ${String(FRAMES)} frames dropped; every pass dropped ${passes.map((pass) => String(pass.droppedFrames)).join(", ")}`,
    });
    expect(scrolled.droppedFrames).toBeLessThanOrEqual(MOST_DROPPED_FRAMES);
  });
}
