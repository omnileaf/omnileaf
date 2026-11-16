import type { Locator, Page } from "@playwright/test";

import { NEW_APP_LOCK } from "../../src/lib/app-lock/app-lock.ts";
import { BLUE_WALLPAPER } from "../sample-wallpaper.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  MISSING_COMICS,
  pixelAt,
  pixelOf,
  screenshotPixels,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const BACKEND = {
  ...DEFAULT_BACKEND,
  appLock: () => NEW_APP_LOCK,
  wallpaperColours: () => BLUE_WALLPAPER,
};

const GAP_UNDER_CARD = 16;
const LABEL_LENGTH = 40;
const LINES_WITH_CARD = 4;
const LINE_EDGES = ["1px", "0px", "0px", "0px"];

interface LinedGroup {
  readonly label: string;
  readonly edges: readonly string[];
}

interface Lines {
  readonly lined: readonly LinedGroup[];
  readonly groups: number;
}

interface PageLines {
  readonly route: string;
  readonly lines: number;
}

const PAGE_LINES: readonly PageLines[] = [
  { route: "/settings", lines: 3 },
  { route: "/settings/appearance", lines: 1 },
  { route: "/settings/library", lines: 3 },
  { route: "/settings/privacy", lines: 1 },
  { route: "/settings/about/report", lines: 1 },
];

interface LineAbove {
  readonly route: string;
  readonly between: string;
  readonly above: (page: Page) => Locator;
  readonly group: (page: Page) => Locator;
  readonly gap: number;
}

const GAP_ABOVE_LINE = 8;
const GAP_ABOVE_REPORT_LINE = 16;

function waysToSend(page: Page): Locator {
  return page.getByRole("region", { name: "Other ways to send it" });
}

const LINES_ABOVE: readonly LineAbove[] = [
  {
    route: "/settings/library",
    between: "Home folder and Folders",
    above: (page) => page.getByRole("region", { name: "Home folder" }),
    group: (page) => page.getByRole("region", { name: "Folders" }),
    gap: GAP_ABOVE_LINE,
  },
  {
    route: "/settings/library",
    between: "Scheduled rescans and Library tabs",
    above: (page) =>
      page.getByText(
        "New books show up without a rescan. Turn off to save battery.",
      ),
    group: (page) =>
      page
        .getByRole("list")
        .filter({ has: page.getByRole("link", { name: /^Library tabs/ }) })
        .locator("xpath=.."),
    gap: GAP_ABOVE_LINE,
  },
  {
    route: "/settings/about/report",
    between: "Send and Other ways to send it",
    above: (page) => waysToSend(page).locator("xpath=preceding-sibling::*[1]"),
    group: waysToSend,
    gap: GAP_ABOVE_REPORT_LINE,
  },
];

interface EdgeProbe {
  readonly route: string;
  readonly group: (page: Page) => Locator;
}

const EDGE_PROBES: readonly EdgeProbe[] = [
  {
    route: "/settings/about/report",
    group: waysToSend,
  },
];

interface LineEnds {
  readonly start: readonly number[];
  readonly end: readonly number[];
}

const THEMES = ["light", "dark"] as const;
const DIRECTIONS = ["ltr", "rtl"] as const;
const LINE_WIDTH = 1;
const COLOUR_TOLERANCE = 2;

async function lineEnds(page: Page, group: Locator): Promise<LineEnds> {
  await group.scrollIntoViewIfNeeded();
  const top = (await boxOf(group)).y;
  const { width } = viewportOf(page);
  const strip = await screenshotPixels(page, {
    x: 0,
    y: top,
    width,
    height: LINE_WIDTH,
  });
  const row = Math.floor(strip.height / 2);
  return {
    start: pixelAt(strip, 0, row),
    end: pixelAt(strip, strip.width - 1, row),
  };
}

function expectSameColour(
  pixel: readonly number[],
  colour: readonly number[],
): void {
  expect(pixel).toHaveLength(colour.length);
  for (const [channel, value] of colour.entries()) {
    expect(pixel[channel]).toBeGreaterThanOrEqual(value - COLOUR_TOLERANCE);
    expect(pixel[channel]).toBeLessThanOrEqual(value + COLOUR_TOLERANCE);
  }
}

function linesIn(page: Page): Promise<Lines> {
  return page.getByRole("main").evaluate((main, labelLength) => {
    const groups = [...main.querySelectorAll("[data-settings-group]")];
    const lined = groups
      .map((group) => getComputedStyle(group))
      .flatMap((style, index) =>
        style.borderImageSource === "none"
          ? []
          : [
              {
                label: (groups[index]?.textContent ?? "")
                  .trim()
                  .slice(0, labelLength),
                edges: [
                  style.borderTopWidth,
                  style.borderRightWidth,
                  style.borderBottomWidth,
                  style.borderLeftWidth,
                ],
              },
            ],
      );
    return { lined, groups: groups.length };
  }, LABEL_LENGTH);
}

async function linedCount(page: Page): Promise<number> {
  return (await linesIn(page)).lined.length;
}

function expectOnlyTheLine(lines: Lines): void {
  for (const group of lines.lined) {
    expect(group.edges, group.label).toEqual(LINE_EDGES);
  }
}

test.describe(
  "the lines between settings groups on an Android phone",
  { tag: "@native" },
  () => {
    test.use({ backend: BACKEND });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android phone settings");
    });

    for (const { route, lines } of PAGE_LINES) {
      test(`draws ${String(lines)} full-width lines between the groups on ${route}`, async ({
        page,
      }) => {
        await page.goto(route);

        await expect.poll(() => linedCount(page)).toBe(lines);
        expectOnlyTheLine(await linesIn(page));
      });
    }

    test("draws a line between every licence group, none under the intro", async ({
      page,
    }) => {
      await page.goto("/settings/about/licences");
      await expect
        .poll(async () => (await linesIn(page)).groups)
        .toBeGreaterThan(1);

      const drawn = await linesIn(page);

      expect(drawn.lined).toHaveLength(drawn.groups - 1);
      expectOnlyTheLine(drawn);
    });
  },
);

test.describe(
  "where the lines between settings groups sit on an Android phone",
  { tag: "@native" },
  () => {
    test.use({ backend: BACKEND });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android phone settings");
    });

    for (const { route, between, above, group, gap } of LINES_ABOVE) {
      test(`draws the line between ${between} on ${route} ${String(gap)}px under the group above`, async ({
        page,
      }) => {
        await page.goto(route);

        const upper = await boxOf(above(page));
        const lower = await boxOf(group(page));

        expect(lower.y - (upper.y + upper.height)).toBeCloseTo(gap, 0);
        await expect(group(page)).toHaveCSS("border-top-width", "1px");
      });
    }

    for (const theme of THEMES) {
      for (const direction of DIRECTIONS) {
        for (const { route, group } of EDGE_PROBES) {
          test(`reaches both screen edges on ${route} without scrolling the page sideways, ${theme} and ${direction}`, async ({
            page,
          }) => {
            await page.emulateMedia({ colorScheme: theme });
            await page.goto(route);
            await page.evaluate((dir) => {
              document.documentElement.dir = dir;
            }, direction);
            await expect(group(page)).toHaveCSS("border-top-width", "1px");

            const { start, end } = await lineEnds(page, group(page));
            const separator = await pixelOf(
              page,
              await tokenColour(page, "--color-border"),
            );
            const main = await page
              .getByRole("main")
              .evaluate((element) => [
                element.scrollWidth,
                element.clientWidth,
              ]);

            expectSameColour(start, separator);
            expectSameColour(end, separator);
            expect(main[0]).toBe(main[1]);
          });
        }
      }
    }
  },
);

test.describe(
  "the lines between settings groups under Needs attention on an Android phone",
  { tag: "@native" },
  () => {
    test.use({
      backend: { ...BACKEND, missingLibraryFolders: () => [MISSING_COMICS] },
    });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android phone settings");
    });

    test("draws a line above App under the Needs attention card", async ({
      page,
    }) => {
      await page.goto("/settings");

      await expect.poll(() => linedCount(page)).toBe(LINES_WITH_CARD);
      expectOnlyTheLine(await linesIn(page));
    });

    test("sets the line 16px under Needs attention", async ({ page }) => {
      await page.goto("/settings");
      const card = await boxOf(
        page
          .getByRole("button", { name: /^Needs attention/ })
          .locator("xpath=.."),
      );
      const app = await boxOf(
        page.locator("section", {
          has: page.getByRole("heading", { name: "App" }),
        }),
      );

      expect(app.y - (card.y + card.height)).toBeCloseTo(GAP_UNDER_CARD, 0);
    });
  },
);
