import type { Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const TEN_THOUSAND = 10_000;
const FIRST_GRID_PAINT_BUDGET_MS = 150;
const OPENINGS = 9;

declare global {
  interface Window {
    __omnileafLibraryClickedAt?: number | undefined;
    __omnileafGridPaintedAt?: number | undefined;
  }
}

/** The screen reads only the first page of these, so this times the interface rather than the catalog query. */
const CATALOG = sampleSeries(TEN_THOUSAND);

/** Notes when the next click lands, and when the frame showing the first series after it has painted. */
function timeTheNextGrid(): void {
  window.__omnileafLibraryClickedAt = undefined;
  window.__omnileafGridPaintedAt = undefined;
  document.addEventListener(
    "click",
    (event) => {
      window.__omnileafLibraryClickedAt = event.timeStamp;
    },
    { capture: true, once: true },
  );
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
  const navigation = page.getByRole("navigation", { name: "Main" });
  await navigation.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("list", { name: "Series" })).toHaveCount(0);
  await page.evaluate(timeTheNextGrid);

  await navigation.getByRole("link", { name: "Library" }).click();

  const took = await page.waitForFunction(() =>
    window.__omnileafGridPaintedAt === undefined ||
    window.__omnileafLibraryClickedAt === undefined
      ? undefined
      : window.__omnileafGridPaintedAt - window.__omnileafLibraryClickedAt,
  );
  return Number(await took.jsonValue());
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((one, other) => one - other);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

test.use({
  backend: {
    ...DEFAULT_BACKEND,
    librarySeries: pagedSeries(() => CATALOG),
  },
});

test("paints the first rows of ten thousand series within the budget from the click that opens them", async ({
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
    description: `median ${median(timings).toFixed(1)} ms of ${timings.map((ms) => `${ms.toFixed(1)} ms`).join(", ")}`,
  });
  expect(median(timings)).toBeLessThanOrEqual(FIRST_GRID_PAINT_BUDGET_MS);
});
