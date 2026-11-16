import type { Locator, Page } from "@playwright/test";

import type { LibraryTag, SystemContrast } from "../../src/lib/ipc/bindings.ts";
import { NEW_APP_LOCK } from "../../src/lib/app-lock/app-lock.ts";
import { BLUE_WALLPAPER } from "../sample-wallpaper.ts";
import type { FakeChannel } from "./fake-backend.ts";
import {
  boxOf,
  DEFAULT_BACKEND,
  expect,
  keepReports,
  MISSING_COMICS,
  pixelAt,
  pixelOf,
  screenshotPixels,
  test,
  tokenColour,
  viewportOf,
} from "./fixtures.ts";

const TAGS: readonly LibraryTag[] = [{ name: "Seinen", seriesCount: 1 }];

const KEPT_REPORTS = [
  { code: "R-2QX9", madeAtMs: Date.UTC(2026, 9, 15, 18, 5) },
];

const BACKEND = {
  ...DEFAULT_BACKEND,
  appLock: () => NEW_APP_LOCK,
  wallpaperColours: () => BLUE_WALLPAPER,
  libraryTags: () => [...TAGS],
};

let contrasts: FakeChannel<SystemContrast> | undefined;

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
  readonly groupCount: number;
}

interface PageLines {
  readonly route: string;
  readonly lines: number;
  readonly settled?: (page: Page) => Locator;
}

const PAGE_LINES: readonly PageLines[] = [
  { route: "/settings", lines: 3 },
  { route: "/settings/general", lines: 2 },
  { route: "/settings/appearance", lines: 1 },
  { route: "/settings/accessibility", lines: 3 },
  { route: "/settings/library", lines: 3 },
  { route: "/settings/library/tabs", lines: 1 },
  { route: "/settings/library/adult-content", lines: 1 },
  {
    route: "/settings/library/tags",
    lines: 0,
    settled: (page) =>
      page.getByRole("list", { name: "Tags" }).getByRole("listitem"),
  },
  { route: "/settings/reading", lines: 3 },
  { route: "/settings/privacy", lines: 1 },
  {
    route: "/settings/privacy/app-lock",
    lines: 0,
    settled: (page) => page.getByRole("switch", { name: "Lock Omnileaf" }),
  },
  { route: "/settings/privacy/screenshot-mode", lines: 1 },
  { route: "/settings/privacy/permissions", lines: 1 },
  { route: "/settings/storage", lines: 1 },
  { route: "/settings/advanced", lines: 2 },
  { route: "/settings/advanced/animations", lines: 0 },
  { route: "/settings/general/language", lines: 0 },
  {
    route: "/settings/about",
    lines: 0,
    settled: (page) => page.getByRole("link", { name: /^Your reports/ }),
  },
  { route: "/settings/about/report", lines: 1 },
  {
    route: "/settings/about/reports",
    lines: 0,
    settled: (page) =>
      page.getByRole("list", { name: "Your reports" }).getByRole("listitem"),
  },
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

function turnItOnQuickly(page: Page): Locator {
  return page.getByRole("region", { name: "Turn it on quickly" });
}

function groupHolding(page: Page, control: Locator): Locator {
  return page.locator("[data-settings-group]").filter({ has: control });
}

function ageRatings(page: Page): Locator {
  return groupHolding(
    page,
    page.getByRole("switch", { name: "Use age ratings from book details" }),
  );
}

function opensOn(page: Page): Locator {
  return groupHolding(
    page,
    page.getByRole("button", { name: /^The library opens on/ }),
  );
}

function blockBefore(group: Locator): Locator {
  return group.locator("xpath=preceding-sibling::*[1]");
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
    above: (page) => blockBefore(waysToSend(page)),
    group: waysToSend,
    gap: GAP_ABOVE_REPORT_LINE,
  },
  {
    route: "/settings/accessibility",
    between: "Text and Motion and contrast",
    above: (page) => page.getByRole("region", { name: "Text" }),
    group: (page) => page.getByRole("region", { name: "Motion and contrast" }),
    gap: GAP_ABOVE_LINE,
  },
  {
    route: "/settings/advanced",
    between: "Animations and Navigation",
    above: (page) => page.getByRole("list").filter({ hasText: "Animations" }),
    group: (page) => page.getByRole("region", { name: "Navigation" }),
    gap: GAP_ABOVE_LINE,
  },
  {
    route: "/settings/advanced",
    between: "Navigation and Undo",
    above: (page) => page.getByRole("region", { name: "Navigation" }),
    group: (page) => page.getByRole("region", { name: "Undo" }),
    gap: GAP_ABOVE_LINE,
  },
  {
    route: "/settings/privacy/screenshot-mode",
    between: "the switches and Turn it on quickly",
    above: (page) => blockBefore(turnItOnQuickly(page)),
    group: turnItOnQuickly,
    gap: GAP_ABOVE_LINE,
  },
  {
    route: "/settings/library/adult-content",
    between: "the choice and Use age ratings",
    above: (page) => blockBefore(ageRatings(page)),
    group: ageRatings,
    gap: GAP_ABOVE_LINE,
  },
  {
    route: "/settings/library/tabs",
    between: "the tabs and The library opens on",
    above: (page) => blockBefore(opensOn(page)),
    group: opensOn,
    gap: GAP_ABOVE_LINE,
  },
];

const HEADINGS_ON_LINES = [
  { route: "/settings/accessibility", heading: "Motion and contrast" },
  { route: "/settings/advanced", heading: "Navigation" },
  { route: "/settings/advanced", heading: "Undo" },
] as const;

interface EdgeProbe {
  readonly route: string;
  readonly group: (page: Page) => Locator;
}

const EDGE_PROBES: readonly EdgeProbe[] = [
  {
    route: "/settings/about/report",
    group: waysToSend,
  },
  {
    route: "/settings/accessibility",
    group: (page) => page.getByRole("region", { name: "Motion and contrast" }),
  },
  {
    route: "/settings/library",
    group: (page) => page.getByRole("region", { name: "Folders" }),
  },
  {
    route: "/settings/storage",
    group: (page) =>
      page
        .locator("section")
        .filter({ has: page.getByText("Cached pages", { exact: true }) }),
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
    const lined = groups.flatMap((group) => {
      const style = getComputedStyle(group);
      return style.borderImageSource === "none"
        ? []
        : [
            {
              label: group.textContent.trim().slice(0, labelLength),
              edges: [
                style.borderTopWidth,
                style.borderRightWidth,
                style.borderBottomWidth,
                style.borderLeftWidth,
              ],
            },
          ];
    });
    return { lined, groupCount: groups.length };
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

    test.beforeEach(async ({ page, platform }) => {
      test.skip(platform !== "android", "Android phone settings");
      await keepReports(page, KEPT_REPORTS);
    });

    for (const { route, lines, settled } of PAGE_LINES) {
      test(`draws ${String(lines)} full-width lines between the groups on ${route}`, async ({
        page,
      }) => {
        await page.goto(route);
        if (settled !== undefined) {
          await expect(settled(page)).toBeVisible();
        }

        await expect.poll(() => linedCount(page)).toBe(lines);
        expectOnlyTheLine(await linesIn(page));
      });
    }

    test("draws a line between every licence group, none under the intro", async ({
      page,
    }) => {
      await page.goto("/settings/about/licences");
      await expect
        .poll(async () => (await linesIn(page)).groupCount)
        .toBeGreaterThan(1);

      const drawn = await linesIn(page);

      expect(drawn.lined).toHaveLength(drawn.groupCount - 1);
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

    for (const { route, heading } of HEADINGS_ON_LINES) {
      test(`sets ${heading} on ${route} straight under its line`, async ({
        page,
      }) => {
        await page.goto(route);

        const group = await boxOf(page.getByRole("region", { name: heading }));
        const title = await boxOf(
          page.getByRole("heading", { name: heading, exact: true }),
        );

        expect(title.y - group.y).toBeCloseTo(LINE_WIDTH, 0);
      });
    }

    test("leaves Reading mode and Tap zones in one group", async ({ page }) => {
      await page.goto("/settings/reading");
      const mode = await boxOf(
        page.getByRole("button", { name: /^Reading mode/ }),
      );
      const zones = await boxOf(
        page.getByRole("button", { name: /^Tap zones/ }),
      );

      expect(zones.y - (mode.y + mode.height)).toBeCloseTo(0, 0);
    });

    test("draws no line under the intro on Permissions", async ({ page }) => {
      await page.goto("/settings/privacy/permissions");
      const list = page.getByRole("list", { name: "Permissions" });

      await expect(list).toHaveCSS("border-image-source", "none");
      await expect(list).toHaveCSS("border-top-width", "0px");
    });

    test("draws no line under the intro on Licences", async ({ page }) => {
      await page.goto("/settings/about/licences");
      const first = page.locator("main section").first();

      await expect(first).toHaveCSS("border-image-source", "none");
      await expect(first).toHaveCSS("border-top-width", "0px");
    });

    test("draws Turn it on quickly flat, with no card edge", async ({
      page,
    }) => {
      await page.goto("/settings/privacy/screenshot-mode");
      const section = turnItOnQuickly(page);

      for (const edge of ["right", "bottom", "left"]) {
        await expect(section).toHaveCSS(`border-${edge}-width`, "0px");
      }
      await expect(section).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(section).toHaveCSS("border-top-width", "1px");
    });

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
              await tokenColour(page, "--native-color-settings-rule"),
            );
            const { scrollWidth, clientWidth } = await page
              .getByRole("main")
              .evaluate((main) => ({
                scrollWidth: main.scrollWidth,
                clientWidth: main.clientWidth,
              }));

            expectSameColour(start, separator);
            expectSameColour(end, separator);
            expect(scrollWidth).toBe(clientWidth);
          });
        }
      }
    }
  },
);

test.describe(
  "the line between settings groups at high Colour contrast on an Android phone",
  { tag: "@native" },
  () => {
    test.use({
      backend: {
        ...BACKEND,
        watchSystemContrast: (channel) => {
          contrasts = channel;
          return null;
        },
      },
    });

    test.beforeEach(({ platform }) => {
      test.skip(platform !== "android", "Android phone settings");
      contrasts = undefined;
    });

    for (const { route, group } of EDGE_PROBES) {
      test(`colours the line on ${route} edge to edge in the settings rule colour`, async ({
        page,
      }) => {
        await page.goto(route);
        await expect.poll(() => contrasts).toBeDefined();
        await contrasts?.send("high");
        await expect(page.locator("html")).toHaveAttribute(
          "data-contrast",
          "high",
        );

        const { start, end } = await lineEnds(page, group(page));
        const separator = await pixelOf(
          page,
          await tokenColour(page, "--native-color-settings-rule"),
        );

        expectSameColour(start, separator);
        expectSameColour(end, separator);
      });
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
