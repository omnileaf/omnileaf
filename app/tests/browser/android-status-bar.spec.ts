import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { DEFAULT_LIBRARY_VIEW } from "../../src/lib/ipc/bindings.ts";
import javascript from "../../src/lib/licences/javascript.json" with { type: "json" };
import { licensedPackages } from "../../src/lib/licences/licences.ts";
import rust from "../../src/lib/licences/rust.json" with { type: "json" };
import { sampleSeriesId } from "../../src/lib/sample-library/sample-library.ts";
import { DEFAULT_BACKEND, expect, test } from "./fixtures.ts";
import { sampleLibraryOn } from "./screens.ts";
import { pagedSeries, sampleSeries } from "./series-catalog.ts";
import { FakeShelf, SERIES_ID } from "./series-shelf.ts";

const STATUS_BAR = 24;
const SCROLL_STEPS = [8, 24, 48, 96, 200, 400] as const;
const PHONE = { width: 412, height: 700 };
const TABLET = { width: 820, height: 1180 };
const LIBRARY_SIZE = 40;
const SHELF_SIZE = 30;
const NOT_STARTED = { state: "notStarted" } as const;
const EARLIER_VERSION = "1.2.2";
const SAMPLE_SERIES = sampleSeriesId(21);
const [FIRST_PACKAGE] = licensedPackages({ rust, javascript });
const APP_ROUTES = fileURLToPath(
  new URL("../../src/routes/(app)", import.meta.url),
);
const PAGE_FILE = "+page.svelte";

type Screen = typeof PHONE;

interface GuardedScreen {
  readonly route: string;
  readonly path: string;
}

const LIBRARY_SCREENS: readonly GuardedScreen[] = [
  ...[
    "/",
    "/browse",
    "/history",
    "/search",
    "/settings",
    "/settings/general",
    "/settings/general/language",
    "/settings/general/opens-on",
    "/settings/general/time-format",
    "/settings/appearance",
    "/settings/accessibility",
    "/settings/library",
    "/settings/library/adult-content",
    "/settings/library/folders",
    "/settings/library/tabs",
    "/settings/library/tags",
    "/settings/reading",
    "/settings/privacy",
    "/settings/privacy/app-lock",
    "/settings/privacy/permissions",
    "/settings/privacy/screenshot-mode",
    "/settings/storage",
    "/settings/advanced",
    "/settings/advanced/animations",
    "/settings/about",
    "/settings/about/licences",
    "/settings/about/report",
    "/settings/about/reports",
    "/settings/about/whats-new",
  ].map((route) => ({ route, path: route })),
  { route: "/creator/[name]", path: "/creator/Sample%20Writer" },
  {
    route: "/settings/about/whats-new/[version]",
    path: `/settings/about/whats-new/${EARLIER_VERSION}`,
  },
  {
    route: "/settings/about/licences/[...package]",
    path: `/settings/about/licences/${FIRST_PACKAGE?.key ?? ""}`,
  },
];

const SAMPLE_SCREENS: readonly GuardedScreen[] = [
  { route: "/series/[id]", path: `/series/${SAMPLE_SERIES}` },
  {
    route: "/series/[id]/volume/[volume]",
    path: `/series/${SAMPLE_SERIES}/volume/2`,
  },
];

const TABLET_SCREENS = ["/", "/history", "/settings/general"] as const;

const FULL_SCREEN_ROUTES = ["/series/[id]/edit"] as const;

function appRoutes(): string[] {
  return readdirSync(APP_ROUTES, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(PAGE_FILE))
    .map(
      (file) =>
        `/${file.slice(0, -PAGE_FILE.length)}`.replace(/\/$/, "") || "/",
    )
    .toSorted();
}

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
        if (element.closest("[data-series-band]") !== null) {
          return undefined;
        }
        if (element.hasAttribute("data-ground")) {
          continue;
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

  test("guards every page that scrolls in the app", () => {
    const guarded = new Set([
      ...LIBRARY_SCREENS.map(({ route }) => route),
      ...SAMPLE_SCREENS.map(({ route }) => route),
      ...FULL_SCREEN_ROUTES,
    ]);

    expect(appRoutes().filter((route) => !guarded.has(route))).toEqual([]);
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
        whatsNew: () => ({
          installed: null,
          earlier: [
            {
              version: EARLIER_VERSION,
              entries: [{ kind: "fix", summary: "Covers no longer flicker" }],
            },
          ],
        }),
      },
    });

    for (const { route, path } of LIBRARY_SCREENS) {
      test(`keeps ${route} from showing through it once it scrolls`, async ({
        page,
      }) => {
        await expectNothingUnderStatusBar(page, path);
      });
    }
  });

  test.describe("over the sample library", () => {
    test.use({ backend: sampleLibraryOn("android") });

    for (const { route, path } of SAMPLE_SCREENS) {
      test(`keeps ${route} from showing through it once it scrolls`, async ({
        page,
      }) => {
        await expectNothingUnderStatusBar(page, path);
      });
    }

    test("leaves a series' cover band showing under the status bar until the top app bar fills", async ({
      page,
    }) => {
      await openUnderStatusBar(page, `/series/${SAMPLE_SERIES}`, PHONE);
      const surface = page.locator("[data-status-bar-surface]");
      const bar = page.getByRole("main").locator("header").first();

      await scrollTo(page, SCROLL_STEPS[0]);

      await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(bar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });
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
  });
});
