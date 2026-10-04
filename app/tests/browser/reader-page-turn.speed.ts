import type { Page } from "@playwright/test";

import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { BOOK_ID, readerBackend, servePages } from "./reader-book.ts";

const PRELOADED_TURN_BUDGET_MS = 16;
const TURNS = 20;
const P95 = 0.95;

declare global {
  interface Window {
    __omnileafKeyPressedAt?: number | undefined;
    __omnileafPageShownAt?: number | undefined;
  }
}

/** Notes when the next key goes down, and when page `number` is shown and laid out after it. */
function timeTheTurnTo(number: number): void {
  window.__omnileafKeyPressedAt = undefined;
  window.__omnileafPageShownAt = undefined;
  document.addEventListener(
    "keydown",
    (event) => {
      window.__omnileafKeyPressedAt = event.timeStamp;
    },
    { capture: true, once: true },
  );
  const shown = (): HTMLImageElement | null =>
    document.querySelector<HTMLImageElement>(
      `img[alt="Page ${String(number)}"]:not([aria-hidden])`,
    );
  new MutationObserver((_, observer) => {
    const image = shown();
    if (image === null) {
      return;
    }
    observer.disconnect();
    image.getBoundingClientRect();
    window.__omnileafPageShownAt = performance.now();
  }).observe(document, { attributes: true, childList: true, subtree: true });
}

async function turnTimed(page: Page, to: number): Promise<number> {
  await expect(page.locator(`img[alt="Page ${String(to)}"]`)).not.toHaveClass(
    /invisible/,
  );
  await page.evaluate(timeTheTurnTo, to);

  await page.keyboard.press("ArrowRight");

  const took = await page.waitForFunction(() =>
    window.__omnileafPageShownAt === undefined ||
    window.__omnileafKeyPressedAt === undefined
      ? undefined
      : window.__omnileafPageShownAt - window.__omnileafKeyPressedAt,
  );
  return Number(await took.jsonValue());
}

function percentile(values: readonly number[], share: number): number {
  const sorted = values.toSorted((one, other) => one - other);
  return sorted[Math.ceil(sorted.length * share) - 1] ?? Number.NaN;
}

test.use({ backend: readerBackend(DEFAULT_BACKEND) });

test("turns to a page read ahead within a frame's budget from the key that turns it", async ({
  page,
}) => {
  await servePages(page);
  await page.goto(`/read/${BOOK_ID}`);
  await expect(
    page.getByRole("img", { name: "Page 1", exact: true }),
  ).toBeVisible();
  const timings: number[] = [];

  for (let turn = 0; turn < TURNS; turn += 1) {
    timings.push(await turnTimed(page, turn + 2));
  }

  const p95 = percentile(timings, P95);
  test.info().annotations.push({
    type: "preloaded page turn",
    description: `p95 ${p95.toFixed(1)} ms of ${timings.map((ms) => `${ms.toFixed(1)} ms`).join(", ")}`,
  });
  expect(p95).toBeLessThanOrEqual(PRELOADED_TURN_BUDGET_MS);
});
