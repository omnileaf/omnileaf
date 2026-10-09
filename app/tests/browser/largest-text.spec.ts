import type { Page } from "@playwright/test";

import {
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
} from "../../src/lib/ipc/bindings.ts";
import { fakeProtocolRoute } from "./fake-backend.ts";
import {
  APP_PAGES,
  expect,
  onPlatform,
  sidewaysOverflow,
  test,
} from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";

const LARGEST_TEXT = ":root { --text-scale: 2 !important; }";
const PAGES = [
  ...APP_PAGES,
  "/settings/privacy",
  "/settings/privacy/screenshot-mode",
] as const;
const PLATFORMS = ["ios", "android"] as const;
const GLYPH_OVERSHOOT = 4;
const IPAD_LANDSCAPE = { width: 1180, height: 820 };
const DISPLAYS: readonly LibraryDisplay[] = [
  "grid",
  "compact",
  "covers",
  "list",
];
const SERIES_IN_LIBRARY = 24;
const COVER_IMAGE = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#7fcb9d"/></svg>`;
const FIRST_LAUNCH_STEPS = ["welcome", "home", "link", "choices", "ready"];

/** Lists text taller than its box that isn't clamped on purpose, beyond what a glyph's overshoot accounts for. */
function textSpillingDown(page: Page): Promise<string[]> {
  return page.evaluate((overshoot) => {
    const spilled: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      const style = getComputedStyle(element);
      if (
        element.clientWidth === 0 ||
        element.closest("[aria-hidden=true], [inert]") !== null ||
        style.textOverflow === "ellipsis" ||
        style.clipPath !== "none" ||
        style.webkitLineClamp !== "none"
      ) {
        continue;
      }
      const hasText = [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      );
      const isScroller = ["auto", "scroll"].includes(style.overflowY);
      if (
        hasText &&
        !isScroller &&
        element.scrollHeight - element.clientHeight > overshoot
      ) {
        spilled.push(element.outerHTML.slice(0, 140));
      }
    }
    return spilled;
  }, GLYPH_OVERSHOOT);
}

test.skip(
  ({ isMobile }) => !isMobile,
  "the system text size reaches phones and tablets",
);

for (const platform of PLATFORMS) {
  test.describe(`with the largest text on ${platform}`, () => {
    test.use(onPlatform(platform));

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((css) => {
        document.addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = css;
          document.head.append(style);
        });
      }, LARGEST_TEXT);
    });

    async function expectNothingSpills(page: Page): Promise<void> {
      expect(await sidewaysOverflow(page, "body")).toEqual([]);
      expect(await textSpillingDown(page)).toEqual([]);
    }

    for (const path of PAGES) {
      test(`fits ${path} without spilling`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        await expectNothingSpills(page);
      });

      test(`fits ${path} without spilling in an iPad's landscape window`, async ({
        page,
      }) => {
        await page.setViewportSize(IPAD_LANDSCAPE);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        await expectNothingSpills(page);
      });
    }

    for (const display of DISPLAYS) {
      test.describe(`with series shown as ${display}`, () => {
        test.use({
          backend: {
            ...onPlatform(platform).backend,
            librarySeries: pagedSeries(() =>
              sampleSeries(SERIES_IN_LIBRARY).map((series, index) => ({
                ...series,
                cover: `thumb/v1/0190a3e4-0000-8000-8000-000000000001/${String(index + 1)}/1`,
              })),
            ),
            librarySeriesCount: () => SERIES_IN_LIBRARY,
            libraryView: () => ({ ...DEFAULT_LIBRARY_VIEW, display }),
          },
        });

        test("fits the library without spilling", async ({ page }) => {
          await page.route(fakeProtocolRoute("omni"), (route) =>
            route.fulfill({ contentType: "image/svg+xml", body: COVER_IMAGE }),
          );
          await page.goto("/");
          await expect(
            page.getByText("Sample Series 0001").first(),
          ).toBeVisible();

          await expectNothingSpills(page);
        });
      });
    }

    test.describe("on first launch", () => {
      test.use({
        backend: {
          ...onPlatform(platform).backend,
          firstLaunchFinished: () => false,
        },
      });

      for (const [index, step] of FIRST_LAUNCH_STEPS.entries()) {
        test(`fits the ${step} step without spilling`, async ({ page }) => {
          await page.goto("/first-launch");
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          for (let left = 0; left < index; left += 1) {
            await page
              .getByRole("main")
              .getByRole("button", { name: /^(Get started|Continue)$/ })
              .click();
            await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
          }

          await expectNothingSpills(page);
        });
      }
    });
  });
}
