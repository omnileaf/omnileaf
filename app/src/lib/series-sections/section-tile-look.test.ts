import { clearMocks, mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { SeriesBook } from "#lib/ipc/bindings.ts";
import { type CoverPath, coverUrl } from "#lib/library/cover-url.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { columnsOf } from "#lib/virtual-grid/grid-keys.ts";

import SectionCoversHarness from "./SectionCoversHarness.svelte";
import type { SectionTile } from "./section-tiles";

const DESKTOP_WINDOW = { width: 1280, height: 800 } as const;
const BOOKS_COLUMN = 640;
const COVERS_A_ROW_ON_THE_BOARD = 6;
const GAP_NAME = "Volumes 5 and 6 are not in the folder";
const VOLUME_SEVEN_COVER =
  "thumb/v1/0190a3e4-0000-8000-8000-000000000007/1/1" as CoverPath;
const READ_MARK_SIZE = 24;
const READ_MARK_INSET = "6px";

function volume(
  first: number,
  reading: SeriesBook["reading"],
  cover: CoverPath | null = null,
): SectionTile {
  return {
    kind: "book",
    book: {
      id: `0190a3e4-0000-8000-8000-00000000000${String(first)}` as SeriesBook["id"],
      position: first,
      title: `v${String(first)}.cbz`,
      cover,
      addedAtMs: 0,
      reading,
      pageCount: 190,
      isBookmarked: false,
      isNew: false,
      isFileMissing: false,
      kind: "volume",
      numbers: { first, last: first },
      volume: null,
      section: "volumes",
    },
  };
}

const TILES: readonly SectionTile[] = [
  volume(4, { state: "read" }),
  { kind: "gap", missing: { first: 5, last: 6 } },
  volume(7, { state: "started", page: 42 }, VOLUME_SEVEN_COVER),
];

function styleOf(element: Element | null): CSSStyleDeclaration {
  if (element === null) {
    throw new Error("the tile drew no such part");
  }
  return getComputedStyle(element);
}

async function drawTiles(): Promise<{
  readonly list: HTMLElement;
  readonly gap: HTMLElement;
  readonly link: HTMLElement;
  readonly started: HTMLElement;
}> {
  followCorePlatform("linux");
  document.documentElement.dataset.theme = "light";
  await render(SectionCoversHarness, { tiles: TILES, width: BOOKS_COLUMN });
  return {
    list: page.getByRole("list", { name: "Volumes" }).element() as HTMLElement,
    gap: page.getByRole("img", { name: GAP_NAME }).element() as HTMLElement,
    link: page
      .getByRole("link", { name: "Volume 4 Read" })
      .element() as HTMLElement,
    started: page
      .getByRole("link", { name: "Volume 7 Page 42 of 190" })
      .element() as HTMLElement,
  };
}

beforeEach(async () => {
  mockConvertFileSrc("linux");
  await page.viewport(DESKTOP_WINDOW.width, DESKTOP_WINDOW.height);
});

afterEach(() => {
  clearMocks();
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("fits six covers a row in the series page's books column", async () => {
  const { list } = await drawTiles();

  expect(columnsOf(list)).toBe(COVERS_A_ROW_ON_THE_BOARD);
});

test("draws a missing run as a dashed muted box the size of a cover", async () => {
  const { gap, link } = await drawTiles();
  const box = styleOf(gap.firstElementChild);
  const cover = link.firstElementChild?.getBoundingClientRect();

  expect({
    edge: box.borderTopStyle,
    ink: box.borderTopColor,
    corner: box.borderTopLeftRadius,
    height: gap.firstElementChild?.getBoundingClientRect().height,
  }).toEqual({
    edge: "dashed",
    ink: resolvedColour("--secondary-text", "color"),
    corner: "6px",
    height: cover?.height,
  });
});

test("keeps a missing run out of the tab order", async () => {
  const { gap } = await drawTiles();

  expect([
    gap.tabIndex,
    gap.querySelectorAll("a, button, [tabindex]").length,
  ]).toEqual([-1, 0]);
});

test("names a volume and its reading under a plain cover", async () => {
  const { link } = await drawTiles();
  const [title, meta] = Array.from(
    link.lastElementChild?.children ?? [],
    (part) => getComputedStyle(part),
  );

  expect({
    corner: styleOf(link.firstElementChild).borderTopLeftRadius,
    title: [title?.fontSize, title?.fontWeight],
    meta: [meta?.fontSize, meta?.color],
  }).toEqual({
    corner: "6px",
    title: ["14px", "500"],
    meta: ["12px", resolvedColour("--secondary-text", "color")],
  });
});

test("shows how far a started volume is read", async () => {
  await drawTiles();

  await expect
    .element(page.getByRole("link", { name: "Volume 7 Page 42 of 190" }))
    .toBeVisible();
});

test("draws a volume's own cover", async () => {
  const { started } = await drawTiles();

  expect(started.querySelector("img")?.getAttribute("src")).toBe(
    coverUrl(VOLUME_SEVEN_COVER),
  );
});

test("draws a stand-in over a volume's own cover in screenshot mode", async () => {
  followCorePlatform("linux");
  await render(SectionCoversHarness, {
    tiles: TILES,
    width: BOOKS_COLUMN,
    usesStandIns: true,
  });
  const started = page
    .getByRole("link", { name: "Volume 7 Page 42 of 190" })
    .element();

  expect({
    picture: started.querySelector("img"),
    hasStandIn: started.querySelector(".bg-stand-in-pattern") !== null,
  }).toEqual({ picture: null, hasStandIn: true });
});

test("keeps the plain cover for a volume without one", async () => {
  const { link } = await drawTiles();

  expect(link.querySelector("img")).toBeNull();
});

test("marks a finished volume with a round check badge in its cover's corner", async () => {
  const { link } = await drawTiles();
  const mark = link.firstElementChild?.querySelector("[data-read-mark]");
  const style = styleOf(mark ?? null);

  expect({
    size: [
      mark?.getBoundingClientRect().width,
      mark?.getBoundingClientRect().height,
    ],
    isRound: Number.parseFloat(style.borderTopLeftRadius) >= READ_MARK_SIZE / 2,
    fill: style.backgroundColor,
    ink: style.color,
    top: style.insetBlockStart,
    end: style.insetInlineEnd,
    ring: style.boxShadow.includes(
      `${resolvedColour("--background", "color")} 0px 0px 0px 2px`,
    ),
    hidden: mark?.getAttribute("aria-hidden"),
  }).toEqual({
    size: [READ_MARK_SIZE, READ_MARK_SIZE],
    isRound: true,
    fill: resolvedColour("--primary", "backgroundColor"),
    ink: resolvedColour("--primary-foreground", "color"),
    top: READ_MARK_INSET,
    end: READ_MARK_INSET,
    ring: true,
    hidden: "true",
  });
});

test("leaves an unfinished volume without the check badge", async () => {
  const { started } = await drawTiles();

  expect(started.querySelector("[data-read-mark]")).toBeNull();
});
