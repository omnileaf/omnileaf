import type { Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import { DEFAULT_BACKEND, expect, test, tokenColour } from "./fixtures.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const STATUS_BAR = 24;
const FAR_DOWN = 400;
const SCROLL_STEPS = [8, 24, 48, 96, 200, FAR_DOWN] as const;
const PHONE = { width: 412, height: 700 };
const TABLET = { width: 820, height: 1180 };
const TABLET_SCREENS = ["/", "/history", "/settings/general"] as const;

type Screen = typeof PHONE;
const LIBRARY_SIZE = 40;
const SHELF_SIZE = 30;
const NOT_STARTED = { state: "notStarted" } as const;

const SCROLLING_SCREENS = [
  "/",
  "/browse",
  "/history",
  "/search",
  `/series/${SERIES_ID}`,
  "/creator/Sample%20Writer",
  "/settings",
  "/settings/general",
  "/settings/general/language",
  "/settings/appearance",
  "/settings/accessibility",
  "/settings/library",
  "/settings/library/folders",
  "/settings/library/tabs",
  "/settings/library/tags",
  "/settings/reading",
  "/settings/privacy",
  "/settings/privacy/permissions",
  "/settings/storage",
  "/settings/advanced",
  "/settings/about",
  "/settings/about/licences",
  "/settings/about/report",
  "/settings/about/reports",
  "/settings/about/whats-new",
] as const;

async function openUnderStatusBar(
  page: Page,
  route: string,
  screen: Screen,
): Promise<void> {
  await page.setViewportSize(screen);
  await page.addInitScript((top) => {
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.setProperty(
        "--system-inset-top",
        `${String(top)}px`,
      );
    });
  }, STATUS_BAR);
  await page.goto(route);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeAttached();
}

async function makeRoomToScroll(page: Page): Promise<void> {
  await page.getByRole("main").evaluate((main) => {
    const room = document.createElement("div");
    room.style.blockSize = "200vh";
    room.style.flexShrink = "0";
    main.append(room);
  });
}

async function scrollTo(page: Page, top: number): Promise<void> {
  await page.getByRole("main").evaluate((main, to) => {
    main.scrollTo({ top: to });
  }, top);
}

async function contentInStatusBar(page: Page): Promise<string[]> {
  return page.evaluate((statusBar) => {
    const isPinned = (element: Element): boolean =>
      ["sticky", "fixed"].includes(getComputedStyle(element).position);
    const isPainted = (element: Element): boolean => {
      const colour = getComputedStyle(element).backgroundColor;
      return colour !== "transparent" && colour !== "rgba(0, 0, 0, 0)";
    };
    const showsSomething = (element: Element): boolean =>
      isPainted(element) ||
      ["IMG", "svg", "CANVAS", "VIDEO"].includes(element.tagName) ||
      [...element.childNodes].some(
        (node) =>
          node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== "",
      );
    const pinnedSurfaceOf = (element: Element): Element | undefined => {
      for (
        let at: Element | null = element;
        at !== null;
        at = at.parentElement
      ) {
        if (isPinned(at)) {
          return at;
        }
      }
      return undefined;
    };
    const coversStatusBar = (element: Element, pinned: Element): boolean => {
      for (
        let at: Element | null = element;
        at !== null;
        at = at.parentElement
      ) {
        const box = at.getBoundingClientRect();
        if (isPainted(at) && box.top <= 0 && box.bottom >= statusBar) {
          return true;
        }
        if (at === pinned) {
          return false;
        }
      }
      return false;
    };
    const scrolling = document.querySelector("main");
    const firstPainter = (x: number): string | undefined => {
      for (const element of document.elementsFromPoint(x, statusBar / 2)) {
        if (scrolling === null || !scrolling.contains(element)) {
          return undefined;
        }
        const pinned = pinnedSurfaceOf(element);
        if (pinned !== undefined) {
          if (coversStatusBar(element, pinned)) {
            return undefined;
          }
          continue;
        }
        if (showsSomething(element)) {
          return `${element.tagName} at x ${String(x)}: ${element.textContent.trim().slice(0, 40)}`;
        }
      }
      return undefined;
    };
    const width = document.documentElement.clientWidth;
    return [16, width / 2, width - 16].flatMap((x) => {
      const painter = firstPainter(x);
      return painter === undefined ? [] : [painter];
    });
  }, STATUS_BAR);
}

async function expectNothingUnderStatusBar(
  page: Page,
  route: string,
  screen: Screen = PHONE,
): Promise<void> {
  await openUnderStatusBar(page, route, screen);
  await makeRoomToScroll(page);

  for (const top of SCROLL_STEPS) {
    await scrollTo(page, top);

    await expect
      .poll(() => contentInStatusBar(page), {
        message: `scrolled ${String(top)}px`,
      })
      .toEqual([]);
  }
}

test.describe("the status bar on an Android phone", { tag: "@native" }, () => {
  test.beforeEach(({ platform }) => {
    test.skip(platform !== "android", "Android draws under the status bar");
  });

  test.describe("over a library of series", () => {
    test.use({
      backend: {
        ...DEFAULT_BACKEND,
        librarySeries: pagedSeries(() => sampleSeries(LIBRARY_SIZE)),
        librarySeriesCount: () => LIBRARY_SIZE,
        libraryView: () => ({
          ...DEFAULT_LIBRARY_VIEW,
          showsItemCounts: true,
        }),
      },
    });

    for (const route of SCROLLING_SCREENS) {
      test(`keeps ${route} from showing through it once it scrolls`, async ({
        page,
      }) => {
        await expectNothingUnderStatusBar(page, route);
      });
    }
  });

  test.describe("on an Android tablet", () => {
    for (const route of TABLET_SCREENS) {
      test(`keeps ${route} from showing through it once it scrolls`, async ({
        page,
      }) => {
        await expectNothingUnderStatusBar(page, route, TABLET);
      });
    }
  });

  test.describe("over a series with books", () => {
    test.use({
      backend: new FakeShelf(
        Array.from({ length: SHELF_SIZE }, () => NOT_STARTED),
      ).backend(),
    });

    test("keeps the series page from showing through it once it scrolls", async ({
      page,
    }) => {
      await expectNothingUnderStatusBar(page, `/series/${SERIES_ID}`);
    });

    test("fills behind the status bar in the top app bar's colour once the bar fills", async ({
      page,
    }) => {
      await openUnderStatusBar(page, `/series/${SERIES_ID}`, PHONE);
      await makeRoomToScroll(page);

      await scrollTo(page, FAR_DOWN);

      const filled = await tokenColour(page, "--native-color-top-bar-scrolled");
      await expect(page.getByRole("main").locator("header").first()).toHaveCSS(
        "background-color",
        filled,
      );
      await expect(page.locator("[data-status-bar-surface]")).toHaveCSS(
        "background-color",
        filled,
      );
    });
  });
});
