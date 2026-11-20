import type { Page } from "@playwright/test";

import { NEW_APP_LOCK } from "../../src/lib/app-lock/app-lock.ts";
import {
  accessibilityViolations,
  boxOf,
  DEFAULT_BACKEND,
  expect,
  screenshotPixels,
  test,
  tokenColour,
} from "./fixtures.ts";

const TABLET = { width: 820, height: 1180 };
const PHONE = { width: 412, height: 900 };
const TWO_PANES = { width: 1280, height: 800 };
const STATUS_BAR = 24;
const TOP_APP_BAR = 64;
const BELOW_LINE = 4;

const SETTINGS_PAGES = [
  "/settings",
  "/settings/general",
  "/settings/general/language",
  "/settings/appearance",
  "/settings/accessibility",
  "/settings/library",
  "/settings/library/tabs",
  "/settings/library/adult-content",
  "/settings/library/tags",
  "/settings/reading",
  "/settings/privacy",
  "/settings/privacy/app-lock",
  "/settings/privacy/screenshot-mode",
  "/settings/privacy/permissions",
  "/settings/storage",
  "/settings/advanced",
  "/settings/advanced/animations",
  "/settings/about",
  "/settings/about/licences",
  "/settings/about/report",
  "/settings/about/reports",
] as const;

const LIST_HEADINGS = [
  { route: "/settings/general", heading: "Omnileaf opens on" },
  { route: "/settings/reading", heading: "End of a book" },
  { route: "/settings/advanced", heading: "Undo" },
] as const;

test.use({ backend: { ...DEFAULT_BACKEND, appLock: () => NEW_APP_LOCK } });

async function openOnTablet(page: Page, route: string): Promise<void> {
  await page.setViewportSize(TABLET);
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

function cardsShown(page: Page): Promise<string[]> {
  return page.getByRole("main").evaluate((main) =>
    [...main.querySelectorAll(".rounded-card")]
      .filter((card) => {
        const style = getComputedStyle(card);
        const isDrawn =
          style.borderLeftWidth !== "0px" ||
          !["transparent", "rgba(0, 0, 0, 0)"].includes(style.backgroundColor);
        return card.getBoundingClientRect().height > 0 && isDrawn;
      })
      .map((card) => card.textContent.trim().slice(0, 40)),
  );
}

test.describe(
  "the Settings pages on an Android tablet",
  { tag: "@native" },
  () => {
    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android's list pages");
    });

    for (const route of SETTINGS_PAGES) {
      test(`draws ${route} with the phone's Material lists, not cards`, async ({
        page,
      }) => {
        await page.setViewportSize(PHONE);
        await page.goto(route);
        await expect(
          page.getByRole("heading", { level: 1 }).first(),
        ).toBeVisible();
        const onPhone = await cardsShown(page);

        await openOnTablet(page, route);

        expect(await cardsShown(page)).toEqual(onPhone);
      });
    }

    test("pins the top app bar over the status bar on a single pane", async ({
      page,
    }) => {
      await page.addInitScript((top) => {
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.style.setProperty(
            "--system-inset-top",
            `${String(top)}px`,
          );
        });
      }, STATUS_BAR);
      await openOnTablet(page, "/settings/general");

      const bar = await boxOf(
        page.getByRole("main").locator("[data-title-bar]"),
      );

      expect([bar.y, bar.height]).toEqual([0, STATUS_BAR + TOP_APP_BAR]);
      await expect(
        page.getByRole("main").getByRole("link", { name: "Back to Settings" }),
      ).toBeVisible();
    });

    test("keeps the open page's lines out of the list of sections beside it", async ({
      page,
    }) => {
      await page.setViewportSize(TWO_PANES);
      await page.goto("/settings/general");
      const sections = await boxOf(
        page.getByRole("navigation", { name: "Settings sections" }),
      );
      const group = await boxOf(
        page
          .locator("[data-settings-group]")
          .filter({ has: page.getByRole("button", { name: /^Language/ }) }),
      );
      const across = { x: sections.x, width: sections.width, height: 1 };

      const onLine = await screenshotPixels(page, { ...across, y: group.y });
      const belowLine = await screenshotPixels(page, {
        ...across,
        y: group.y + BELOW_LINE,
      });

      expect(onLine.rgba).toEqual(belowLine.rgba);
    });

    test("lists Accessibility in the index on a single pane", async ({
      page,
    }) => {
      await openOnTablet(page, "/settings");

      await expect(
        page.getByRole("main").getByRole("link", { name: /^Accessibility/ }),
      ).toBeVisible();
    });

    test("leaves Tap the open tab again out, since only phones' tab bars take it", async ({
      page,
    }) => {
      await openOnTablet(page, "/settings/advanced");

      await expect(page.getByRole("heading", { name: "Undo" })).toBeVisible();
      await expect(
        page.getByText("Tap the open tab again", { exact: true }),
      ).toHaveCount(0);
    });

    test("lists Accessibility beside the open page, as the index does on one pane", async ({
      page,
    }) => {
      await page.setViewportSize(TWO_PANES);
      await page.goto("/settings/general");

      await expect(
        page
          .getByRole("navigation", { name: "Settings sections" })
          .getByRole("link", { name: "Accessibility" }),
      ).toBeVisible();
    });

    for (const { route, heading } of LIST_HEADINGS) {
      test(`heads ${heading} on ${route} as a list header in the accent`, async ({
        page,
      }) => {
        await openOnTablet(page, route);
        const header = page.getByRole("heading", { name: heading });

        await expect(header).toHaveCSS("font-size", "14px");
        await expect(header).toHaveCSS(
          "color",
          await tokenColour(page, "--color-accent"),
        );
      });
    }

    for (const colorScheme of ["light", "dark"] as const) {
      for (const route of ["/settings/general", "/settings/reading"]) {
        test(`has no accessibility violations on ${route} in the ${colorScheme} theme`, async ({
          page,
        }) => {
          await page.emulateMedia({ colorScheme });
          await openOnTablet(page, route);

          expect(await accessibilityViolations(page)).toEqual([]);
        });
      }
    }
  },
);
