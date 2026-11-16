import type { Page } from "@playwright/test";

import type { MissingFolder } from "../../src/lib/ipc/bindings.ts";
import { NEW_APP_LOCK } from "../../src/lib/app-lock/app-lock.ts";
import { BLUE_WALLPAPER } from "../sample-wallpaper.ts";
import { boxOf, DEFAULT_BACKEND, expect, test } from "./fixtures.ts";

const BACKEND = {
  ...DEFAULT_BACKEND,
  appLock: () => NEW_APP_LOCK,
  wallpaperColours: () => BLUE_WALLPAPER,
};

const MISSING_COMICS = {
  folder: {
    id: "5a4d1e00-0000-4000-8002-000000000002",
    kind: "linked",
    name: "Comics",
    location: "/media/Comics",
    isAvailable: false,
  },
  problem: { kind: "missing" },
  hiddenSeries: 41,
  isShownAnyway: false,
} as MissingFolder;

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
  { route: "/settings/privacy", lines: 1 },
  { route: "/settings/about/report", lines: 1 },
];

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
