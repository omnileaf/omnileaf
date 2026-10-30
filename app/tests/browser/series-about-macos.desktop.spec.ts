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

const SKELETON = {
  cover: { width: 168, height: 252 },
  title: { width: 210, height: 24 },
  meta: { width: 140, height: 14 },
  buttonLift: 6,
  button: 24,
  card: 112,
  cardRadius: "12px",
  barShare: 0.6,
  bar: 24,
  rows: 8,
  row: 20,
  rowInset: 8,
  rowGap: 16,
  check: 14,
  textShare: 0.38,
  text: 12,
  trailing: 120,
  radius: "4px",
};
const SIDE_PIECES = 4;
const BOOKS_LEAD_PIECES = 2;
const ROW_PIECES = 3;

function loading(page: Page): Locator {
  return page.getByRole("status", { name: "Loading the series" });
}

function pieces(page: Page): Locator {
  return loading(page).locator("[data-slot=skeleton]");
}

async function openLoading(page: Page): Promise<Box[]> {
  await page.goto(`/series/${SERIES_ID}`);
  await expect(loading(page)).toBeVisible();
  const boxes: Box[] = [];
  for (const piece of await pieces(page).all()) {
    boxes.push(await roundedBoxOf(piece));
  }
  return boxes;
}

function radiusOf(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).borderTopLeftRadius,
  );
}

function sizeOf(box: Box | undefined): [number, number] {
  if (box === undefined) {
    throw new Error("the skeleton piece is missing");
  }
  return [box.width, box.height];
}

function pick(boxes: Box[], index: number): Box {
  const box = boxes[index];
  if (box === undefined) {
    throw new Error(`no skeleton piece ${String(index)}`);
  }
  return box;
}

test.describe("the series' skeleton on macOS", () => {
  testOnlyInItsWebview("macos");
  test.use({
    platform: "macos",
    backend: {
      ...shelf.backend(),
      seriesOverview: () => new Promise(() => undefined),
    },
  });

  test("stands in for the side column's cover, title, line and control", async ({
    page,
  }) => {
    const boxes = await openLoading(page);
    const [cover, title, meta, button] = boxes;

    expect(sizeOf(cover)).toEqual([
      SKELETON.cover.width,
      SKELETON.cover.height,
    ]);
    expect(sizeOf(title)).toEqual([
      SKELETON.title.width,
      SKELETON.title.height,
    ]);
    expect(sizeOf(meta)).toEqual([SKELETON.meta.width, SKELETON.meta.height]);
    expect(sizeOf(button)).toEqual([MACOS.side, SKELETON.button]);
    expect(pick(boxes, 1).y - (pick(boxes, 0).y + SKELETON.cover.height)).toBe(
      MACOS.sideGap,
    );
    expect(pick(boxes, 2).y - (pick(boxes, 1).y + SKELETON.title.height)).toBe(
      MACOS.sideGap,
    );
    expect(pick(boxes, 3).y - (pick(boxes, 2).y + SKELETON.meta.height)).toBe(
      MACOS.sideGap + SKELETON.buttonLift,
    );
    expect(await radiusOf(pieces(page).first())).toBe(SKELETON.radius);
  });

  test("stands in for the card, the toolbar and eight table rows beside it", async ({
    page,
  }) => {
    const boxes = await openLoading(page);
    const side = pick(boxes, SIDE_PIECES - 1);
    const card = pick(boxes, SIDE_PIECES);
    const bar = pick(boxes, SIDE_PIECES + 1);
    const firstRow = SIDE_PIECES + BOOKS_LEAD_PIECES;

    expect(boxes).toHaveLength(firstRow + SKELETON.rows * ROW_PIECES);
    expect(card.x - (side.x + side.width)).toBe(MACOS.columnsGap);
    expect(card.height).toBe(SKELETON.card);
    expect(await radiusOf(pieces(page).nth(SIDE_PIECES))).toBe(
      SKELETON.cardRadius,
    );
    expect(bar.width).toBe(Math.round(card.width * SKELETON.barShare));
    expect(bar.height).toBe(SKELETON.bar);
    expect(bar.y - (card.y + card.height)).toBe(MACOS.sideGap);
    const rowWidth = card.width - 2 * SKELETON.rowInset;
    for (let row = 0; row < SKELETON.rows; row += 1) {
      const at = firstRow + row * ROW_PIECES;
      const check = pick(boxes, at);
      const text = pick(boxes, at + 1);
      const trailing = pick(boxes, at + 2);
      const rowTop = bar.y + bar.height + MACOS.sideGap + row * SKELETON.row;

      expect(sizeOf(check)).toEqual([SKELETON.check, SKELETON.check]);
      expect(check.x).toBe(card.x + SKELETON.rowInset);
      expect(check.y).toBe(rowTop + (SKELETON.row - SKELETON.check) / 2);
      expect(text.x - (check.x + check.width)).toBe(SKELETON.rowGap);
      expect(text.width).toBe(Math.round(rowWidth * SKELETON.textShare));
      expect(text.height).toBe(SKELETON.text);
      expect(sizeOf(trailing)).toEqual([SKELETON.trailing, SKELETON.text]);
      expect(trailing.x + trailing.width).toBe(
        card.x + card.width - SKELETON.rowInset,
      );
    }
  });
});

test.describe("the series' skeleton on Linux", () => {
  testOnlyInItsWebview("linux");
  test.use({
    platform: "linux",
    backend: {
      ...shelf.backend(),
      seriesOverview: () => new Promise(() => undefined),
    },
  });

  test("keeps its own shape", async ({ page }) => {
    const boxes = await openLoading(page);

    expect(sizeOf(boxes[0])).toEqual([LINUX.cover.width, LINUX.cover.height]);
    expect(boxes).toHaveLength(12);
  });
});
