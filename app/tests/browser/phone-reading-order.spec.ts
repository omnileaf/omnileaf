import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

const PAGES = ["/", "/history", "/settings", "/settings/privacy/app-lock"];
const BOTTOM_TENTH = 0.9;

function tabBar(page: Page) {
  return page.getByRole("navigation", { name: "Main" });
}

function isTabBarAfterContent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const content = document.querySelector("main");
    const bar = document.querySelector('nav[aria-label="Main"]');
    return (
      content !== null &&
      bar !== null &&
      (content.compareDocumentPosition(bar) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0
    );
  });
}

test.describe("the reading order on a phone", { tag: "@native" }, () => {
  for (const path of PAGES) {
    test(`reads ${path} before the tab bar`, async ({ page }) => {
      await page.goto(path);
      await expect(tabBar(page)).toBeVisible();

      expect(await isTabBarAfterContent(page)).toBe(true);
    });
  }

  test("reaches the page before the tab bar with the keyboard", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit's Tab key reaches only form controls unless the user turns on Tab to links",
    );
    await page.goto("/settings");
    await expect(tabBar(page)).toBeVisible();

    await page.keyboard.press("Tab");

    await expect(page.locator("main :focus")).toHaveCount(1);
  });

  test("keeps the tab bar at the bottom of the screen", async ({ page }) => {
    await page.goto("/settings");

    const bar = await tabBar(page).boundingBox();
    const content = await page.locator("main").boundingBox();
    const height = page.viewportSize()?.height ?? 0;

    expect(bar).not.toBeNull();
    expect(content).not.toBeNull();
    expect((bar?.y ?? 0) + (bar?.height ?? 0)).toBeGreaterThan(
      height * BOTTOM_TENTH,
    );
    expect(content?.y ?? height).toBeLessThan(bar?.y ?? 0);
  });
});
