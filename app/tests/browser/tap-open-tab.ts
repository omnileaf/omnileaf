import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

export const STORED_KEY = "omnileaf.tapOpenTab";
export const SETTINGS_TOP = "/settings";

const LIBRARY_DOWN = 600;
const SLACK_PX = 2;
const MOST_FRAMES_TO_THE_TOP = 120;

export interface HistoryPlace {
  readonly length: number;
  readonly index: number;
  readonly state: string;
}

export function tabOf(page: Page, name: string): Locator {
  return page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name, exact: true });
}

export function mainOf(page: Page): Locator {
  return page.getByRole("main");
}

export function pathOf(page: Page): string {
  return new URL(page.url()).pathname;
}

export function historyPlaceOf(page: Page): Promise<HistoryPlace> {
  return page.evaluate(() => {
    const state: unknown = history.state;
    const metadata =
      typeof state === "object" && state !== null
        ? (state as Record<string, { historyIndex?: unknown } | undefined>)[
            "sveltekit:metadata"
          ]
        : undefined;
    const index = metadata?.historyIndex;
    if (typeof index !== "number") {
      throw new Error("the entry has no SvelteKit history index");
    }
    return { length: history.length, index, state: JSON.stringify(state) };
  });
}

export async function libraryShown(page: Page): Promise<void> {
  await expect(
    mainOf(page).locator("a[href^='/series/']:not([inert] a)").first(),
  ).toBeVisible();
}

export async function openSeriesFromTheLibrary(page: Page): Promise<void> {
  await libraryShown(page);
  await mainOf(page)
    .locator("a[href^='/series/']:not([inert] a)")
    .first()
    .evaluate((link) => {
      if (link instanceof HTMLElement) {
        link.click();
      }
    });
  await expect.poll(() => pathOf(page)).toMatch(/^\/series\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

export async function scrollLibraryDown(page: Page): Promise<void> {
  await expect
    .poll(() =>
      mainOf(page).evaluate((main, top) => {
        main.scrollTo({ top });
        const reachable = Math.min(top, main.scrollHeight - main.clientHeight);
        return main.scrollTop - reachable;
      }, LIBRARY_DOWN),
    )
    .toBeGreaterThanOrEqual(-SLACK_PX);
  expect(await mainOf(page).evaluate((main) => main.scrollTop)).toBeGreaterThan(
    0,
  );
}

export async function scrollTopsAfterTheTap(
  page: Page,
  tap: () => Promise<void>,
): Promise<number[]> {
  const tops = await page.evaluateHandle((mostFrames) => {
    const seen: number[] = [];
    addEventListener(
      "click",
      () => {
        const main = document.querySelector("main");
        const record = () => {
          const top = main?.scrollTop ?? 0;
          seen.push(top);
          if (top > 0 && seen.length < mostFrames) {
            requestAnimationFrame(record);
          }
        };
        requestAnimationFrame(record);
      },
      { once: true },
    );
    return seen;
  }, MOST_FRAMES_TO_THE_TOP);
  await tap();
  await expect.poll(() => tops.evaluate((seen) => seen.at(-1))).toBe(0);
  return tops.jsonValue();
}

export function placeAfterAPlainBack(
  from: HistoryPlace,
  to: HistoryPlace,
): HistoryPlace {
  return { ...to, length: from.length };
}
