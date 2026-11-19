import { expect, type Locator, type Page } from "@playwright/test";

const PAUSE_AHEAD_MS = 500;

export const TOOLBAR_TUCKS_MS = 3500;

export function bar(page: Page): Locator {
  return page.getByRole("region", { name: "Auto scroll" });
}

export async function startAutoScroll(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Show the controls" }).click();
  await page.getByRole("button", { name: "Start auto scroll" }).click();
  await expect(bar(page)).toBeVisible();
}

export async function isFocusInsideTheBar(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    return [...document.querySelectorAll("section")].some(
      (section) =>
        section.querySelector("h2")?.textContent.trim() === "Auto scroll" &&
        focused !== null &&
        section.contains(focused),
    );
  });
}

export async function holdClockStill(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + PAUSE_AHEAD_MS);
}

export async function scrollTopOf(page: Page): Promise<number> {
  return page.locator("[data-strip]").evaluate((element) => element.scrollTop);
}
