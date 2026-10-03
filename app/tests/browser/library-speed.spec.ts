import type { Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const TEN_THOUSAND = 10_000;
const FIRST_GRID_PAINT_BUDGET_MS = 150;
const OPENINGS = 5;

interface Invoker {
  invoke: (command: string, args: unknown) => Promise<unknown>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: Invoker;
    __omnileafSeriesAskedAt?: number | undefined;
    __omnileafGridPaintedAt?: number | undefined;
    __omnileafTimingSeries?: boolean;
  }
}

const CATALOG = sampleSeries(TEN_THOUSAND);

/** Notes when the library screen next asks for series, and when the frame showing the first of them has painted. */
function timeTheNextGrid(): void {
  window.__omnileafSeriesAskedAt = undefined;
  window.__omnileafGridPaintedAt = undefined;
  const internals = window.__TAURI_INTERNALS__;
  if (internals !== undefined && window.__omnileafTimingSeries !== true) {
    window.__omnileafTimingSeries = true;
    const invoke = internals.invoke;
    internals.invoke = (command, args) => {
      if (command === "library_series") {
        window.__omnileafSeriesAskedAt ??= performance.now();
      }
      return invoke(command, args);
    };
  }
  new MutationObserver((_, observer) => {
    if (document.querySelector("ul[aria-label='Series'] li") === null) {
      return;
    }
    observer.disconnect();
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.__omnileafGridPaintedAt = performance.now();
      });
    });
  }).observe(document, { childList: true, subtree: true });
}

async function openTheLibraryTimed(page: Page): Promise<number> {
  const navigation = page.getByRole("navigation");
  await navigation.getByRole("link", { name: "Settings" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();
  await page.evaluate(timeTheNextGrid);

  await navigation.getByRole("link", { name: "Library" }).click();

  const took = await page.waitForFunction(() =>
    window.__omnileafGridPaintedAt === undefined ||
    window.__omnileafSeriesAskedAt === undefined
      ? undefined
      : window.__omnileafGridPaintedAt - window.__omnileafSeriesAskedAt,
  );
  return Number(await took.jsonValue());
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => CATALOG),
  },
});

test("paints the first rows of ten thousand series within the budget", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("list", { name: "Series" })).toBeVisible();
  const timings: number[] = [];

  for (let opening = 0; opening < OPENINGS; opening += 1) {
    timings.push(await openTheLibraryTimed(page));
  }

  test.info().annotations.push({
    type: "first grid paint",
    description: timings.map((ms) => `${ms.toFixed(1)} ms`).join(", "),
  });
  expect(Math.min(...timings)).toBeLessThanOrEqual(FIRST_GRID_PAINT_BUDGET_MS);
});
