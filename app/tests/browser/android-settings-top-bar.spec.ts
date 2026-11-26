import type { Locator, Page } from "@playwright/test";

import { boxOf, expect, test, tokenColour } from "./fixtures.ts";

const STATUS_BAR = 24;
const TOP_APP_BAR = 64;
const SHORT_PHONE = { width: 412, height: 600 };
const SCROLLED_PAST_TITLE = 400;

const PAGES = [
  { route: "/settings", title: "Settings" },
  { route: "/settings/about/licences", title: "Open-source licences" },
] as const;

async function openUnderStatusBar(page: Page, route: string): Promise<void> {
  await page.setViewportSize(SHORT_PHONE);
  await page.addInitScript((top) => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.setProperty(
        "--system-inset-top",
        `${String(top)}px`,
      );
    });
  }, STATUS_BAR);
  await page.goto(route);
}

function topAppBar(page: Page): Locator {
  return page.getByRole("main").locator("[data-title-bar]");
}

async function scrollPastTitle(page: Page): Promise<void> {
  await page.getByRole("main").evaluate((main, top) => {
    main.scrollTo({ top });
  }, SCROLLED_PAST_TITLE);
}

test.describe(
  "the Settings top app bar on an Android phone",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's top app bar");
    });

    for (const { route, title } of PAGES) {
      test(`rests on ${route} with nothing drawn behind the status bar`, async ({
        page,
      }) => {
        await openUnderStatusBar(page, route);
        const bar = topAppBar(page);

        await expect(
          page.getByRole("heading", { level: 1, name: title }),
        ).toBeVisible();
        await expect(bar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      });

      test(`fills the status bar and the bar on ${route} once rows scroll under it`, async ({
        page,
      }) => {
        await openUnderStatusBar(page, route);
        const bar = topAppBar(page);

        await scrollPastTitle(page);

        await expect(bar).toHaveCSS(
          "background-color",
          await tokenColour(page, "--native-color-top-bar-scrolled"),
        );
        await expect(bar.getByText(title, { exact: true })).toHaveCSS(
          "opacity",
          "1",
        );
        const box = await boxOf(bar);
        expect(box.y).toBeCloseTo(0, 0);
        expect(box.height).toBeCloseTo(STATUS_BAR + TOP_APP_BAR, 0);
      });
    }

    test("keeps the way back in the bar while a page scrolls", async ({
      page,
    }) => {
      await openUnderStatusBar(page, "/settings/about/licences");

      await scrollPastTitle(page);

      const back = await boxOf(
        topAppBar(page).getByRole("link", { name: "Back to About" }),
      );
      expect(back.y).toBeGreaterThanOrEqual(STATUS_BAR);
      expect(back.y + back.height).toBeLessThanOrEqual(
        STATUS_BAR + TOP_APP_BAR,
      );
    });
  },
);
