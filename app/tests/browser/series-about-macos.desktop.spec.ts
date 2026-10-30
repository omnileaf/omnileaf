import type { Locator, Page } from "@playwright/test";

import { boxOf, expect, testOnlyInItsWebview, test } from "./fixtures.ts";
import { FakeShelf, SERIES_ID, SERIES_TITLE } from "./series-shelf.ts";

type Box = Awaited<ReturnType<typeof boxOf>>;

const WINDOW = { width: 1280, height: 800 };
const shelf = new FakeShelf(
  Array.from({ length: 8 }, () => ({ state: "notStarted" }) as const),
  { creators: [{ name: "Author A", role: "story", seriesCount: 1 }] },
);

const MACOS = {
  side: 264,
  sideGap: 14,
  columnsGap: 32,
  cover: { width: 168, height: 252 },
  titleGroupGap: 4,
  title: {
    fontSize: "22px",
    lineHeight: "26px",
    fontWeight: "700",
    letterSpacing: "-0.26px",
  },
  meta: { fontSize: "13px", lineHeight: "16px" },
  pathIcon: 13,
  pathIconGap: 6,
  pathFontSize: "11px",
  control: 24,
  rowGap: 8,
  selectIcon: 13,
  chevron: 11,
  buttonIcon: 13,
  booksGap: "14px",
};

const LINUX = {
  side: 280,
  cover: { width: 180, height: 270 },
  titleFontSize: "24px",
  metaFontSize: "14px",
  booksGap: "16px",
};

function about(page: Page): Locator {
  return page.getByRole("region", { name: "About this series" });
}

function cover(page: Page): Locator {
  return about(page).getByRole("img", { name: `Cover of ${SERIES_TITLE}` });
}

function heading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: SERIES_TITLE });
}

function count(page: Page): Locator {
  return about(page).getByText("8 books", { exact: true });
}

function credits(page: Page): Locator {
  return about(page).locator("p").filter({ hasText: "Author A" });
}

function booksColumn(page: Page): Locator {
  return page.getByRole("region", { name: "Up next" }).locator("..");
}

async function openSeries(page: Page): Promise<void> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(heading(page)).toBeVisible();
}

function rounded(box: Box): Box {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

async function roundedBoxOf(locator: Locator): Promise<Box> {
  return rounded(await boxOf(locator));
}

function typeOf(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      lineHeight: `${String(Math.round(Number.parseFloat(style.lineHeight)))}px`,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
    };
  });
}

function rowGapOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).rowGap);
}

test.use({
  viewport: WINDOW,
  backend: shelf.backend(),
});

test.describe("the series' side column on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({ platform: "macos" });

  test("sits 264 wide beside the books, 32 away", async ({ page }) => {
    await openSeries(page);

    const side = await roundedBoxOf(about(page));
    const books = await roundedBoxOf(booksColumn(page));

    expect(side.width).toBe(MACOS.side);
    expect(books.x - (side.x + side.width)).toBe(MACOS.columnsGap);
    expect(await rowGapOf(booksColumn(page))).toBe(MACOS.booksGap);
  });

  test("shows a 168 cover, 14 above the title", async ({ page }) => {
    await openSeries(page);

    const shown = await roundedBoxOf(cover(page));
    const title = await roundedBoxOf(heading(page));

    expect([shown.width, shown.height]).toEqual([
      MACOS.cover.width,
      MACOS.cover.height,
    ]);
    expect(title.y - (shown.y + shown.height)).toBe(MACOS.sideGap);
  });

  test("sets the title in Title 1 and the lines under it in Body, 4 apart", async ({
    page,
  }) => {
    await openSeries(page);

    const title = await roundedBoxOf(heading(page));
    const byline = await roundedBoxOf(credits(page));

    expect(await typeOf(heading(page))).toEqual(MACOS.title);
    expect(byline.y - (title.y + title.height)).toBe(MACOS.titleGroupGap);
    for (const line of [credits(page), count(page)]) {
      expect(await typeOf(line)).toMatchObject(MACOS.meta);
    }
  });

  test("shows the folder in small mono type after a 13 icon", async ({
    page,
  }) => {
    await openSeries(page);
    const icon = about(page).getByRole("img", { name: "Folder" });
    const path = icon.locator("xpath=following-sibling::span");

    const drawn = await roundedBoxOf(icon);
    const text = await roundedBoxOf(path);

    expect([drawn.width, drawn.height]).toEqual([
      MACOS.pathIcon,
      MACOS.pathIcon,
    ]);
    expect(text.x - (drawn.x + drawn.width)).toBe(MACOS.pathIconGap);
    expect((await typeOf(path)).fontSize).toBe(MACOS.pathFontSize);
  });

  test("fills the column with the reading state, then Tags and Mark read 14 below", async ({
    page,
  }) => {
    await openSeries(page);
    const state = about(page).getByRole("button", { name: /^Reading state/ });
    const tags = about(page).getByRole("button", { name: "Tags" });
    const mark = about(page).getByRole("button", { name: "Mark read" });

    const side = await roundedBoxOf(about(page));
    const select = await roundedBoxOf(state);
    const left = await roundedBoxOf(tags);
    const right = await roundedBoxOf(mark);

    expect([select.width, select.height]).toEqual([MACOS.side, MACOS.control]);
    expect(left.y - (select.y + select.height)).toBe(MACOS.sideGap);
    expect(left.x).toBe(side.x);
    expect(right.x + right.width).toBe(side.x + side.width);
    expect(right.x - (left.x + left.width)).toBe(MACOS.rowGap);
    expect(left.width).toBe(right.width);
    const icons = state.locator("svg");
    expect((await roundedBoxOf(icons.first())).width).toBe(MACOS.selectIcon);
    expect((await roundedBoxOf(icons.last())).width).toBe(MACOS.chevron);
    expect((await roundedBoxOf(tags.locator("svg"))).width).toBe(
      MACOS.buttonIcon,
    );
    expect((await roundedBoxOf(mark.locator("svg"))).width).toBe(
      MACOS.buttonIcon,
    );
  });
});

test.describe("the series' side column on Linux", () => {
  testOnlyInItsWebview("linux");
  test.use({ platform: "linux" });

  test("keeps its own sizes", async ({ page }) => {
    await openSeries(page);

    const side = await roundedBoxOf(about(page));
    const shown = await roundedBoxOf(cover(page));

    expect(side.width).toBe(LINUX.side);
    expect([shown.width, shown.height]).toEqual([
      LINUX.cover.width,
      LINUX.cover.height,
    ]);
    expect((await typeOf(heading(page))).fontSize).toBe(LINUX.titleFontSize);
    expect((await typeOf(count(page))).fontSize).toBe(LINUX.metaFontSize);
    expect(await rowGapOf(booksColumn(page))).toBe(LINUX.booksGap);
  });
});
