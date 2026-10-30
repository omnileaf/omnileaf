import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import {
  commands,
  DEFAULT_LIBRARY_VIEW,
  type LibrarySeries,
  type OnCovers,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { Selection } from "#lib/page/selection.svelte.ts";
import type { SeriesId } from "#lib/series/series-id.ts";

import {
  contrastRatio,
  drawnContrast,
} from "../../../tests/components/contrast-ratio";

import CoverBadges from "./CoverBadges.svelte";
import type { CoverPath } from "./cover-url";
import { NEW_LIBRARY_LISTING } from "./library-listing";
import SelectingCoversHarness from "./SelectingCoversHarness.svelte";
import SeriesCovers from "./SeriesCovers.svelte";

const DESKTOP = { width: 1280, height: 800 };
const ON_COVERS: OnCovers = {
  ...DEFAULT_LIBRARY_VIEW.onCovers,
  showsUnreadCount: true,
  showsDownloaded: true,
  showsLanguage: true,
};
const COVER_EDGE = 1;
const TEXT_CONTRAST = 4.5;
const GRAPHIC_CONTRAST = 3;
const LIGHTEST_COVER_UNDER_THE_CHECK = "#c9c9c9";
const DARKEST_COVER_UNDER_THE_CHECK = "#606060";

async function oneSeries(): Promise<LibrarySeries> {
  mockIPC(() => ({
    series: [
      {
        id: "0190a3e4-0000-8000-8000-0000000000a1",
        title: "Harbour Lights",
        bookCount: 4,
        unreadCount: 3,
        cover: "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1",
        language: "ja",
        hasDownloads: true,
      },
    ],
    next: null,
  }));
  const listed = await commands.librarySeries(null, NEW_LIBRARY_LISTING);
  const [series] = listed.status === "ok" ? listed.data.series : [];
  if (series === undefined) {
    throw new Error("the backend listed no series");
  }
  return series;
}

function styleOf(element: Element | null | undefined): CSSStyleDeclaration {
  if (!(element instanceof Element)) {
    throw new Error("the tile drew no element");
  }
  return getComputedStyle(element);
}

function coversOf(series: LibrarySeries) {
  return {
    series: [series],
    isComplete: true,
    coverUrl: (path: CoverPath) => `omni://localhost/${path}`,
    view: { ...DEFAULT_LIBRARY_VIEW, display: "grid" as const },
    usesStandIns: false,
  };
}

async function drawOn(platform: Platform, theme: "light" | "dark") {
  document.body.replaceChildren();
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  return oneSeries();
}

async function tileOn(platform: Platform, theme: "light" | "dark" = "light") {
  const series = await drawOn(platform, theme);
  const screen = await render(SeriesCovers, coversOf(series));
  const link = screen.container.querySelector("[data-pickable-link]");
  const cover = screen.getByRole("presentation").element().parentElement;
  return { link: link as HTMLElement, cover: cover as HTMLElement };
}

async function pickedTile(isOn: boolean, theme: "light" | "dark" = "light") {
  const series = await drawOn("windows", theme);
  const selection = new Selection<SeriesId>();
  selection.begin(isOn ? series.id : undefined);
  const screen = await render(SelectingCoversHarness, {
    selection,
    ...coversOf(series),
  });
  return vi.waitFor(() => {
    const mark = screen.container.querySelector('[data-slot="selection-mark"]');
    const link = screen.container.querySelector("[data-pickable-link]");
    if (mark === null || link === null) {
      throw new Error("the cell drew no selection mark");
    }
    return { mark: mark as HTMLElement, link: link as HTMLElement };
  });
}

function gapsAround(inner: Element, cover: Element) {
  const outer = cover.getBoundingClientRect();
  const box = inner.getBoundingClientRect();
  return {
    top: box.top - outer.top,
    start: box.left - outer.left,
    end: outer.right - box.right,
  };
}

beforeEach(async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

afterEach(() => {
  clearMocks();
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

function boxOfTile(link: Element): CSSStyleDeclaration {
  return getComputedStyle(link, "::before");
}

test("sets the tile as an ItemContainer reaching 8 past the cover, with a 4 corner and a 2 edge that is clear until picked", async () => {
  const { link } = await tileOn("windows");
  const box = boxOfTile(link);

  expect([
    box.top,
    box.left,
    box.borderTopWidth,
    box.borderTopColor,
    box.borderTopLeftRadius,
  ]).toEqual(["-8px", "-8px", "2px", "rgba(0, 0, 0, 0)", "4px"]);
});

test("keeps the cover as wide and as tall as it is on Linux, at rest and while selecting", async () => {
  const linux = (await tileOn("linux")).cover.getBoundingClientRect();
  const windows = (await tileOn("windows")).cover.getBoundingClientRect();
  const selecting = (await pickedTile(false)).mark.parentElement;

  expect([windows.width, windows.height]).toEqual([linux.width, linux.height]);
  expect([
    selecting?.getBoundingClientRect().width,
    selecting?.getBoundingClientRect().height,
  ]).toEqual([linux.width, linux.height]);
});

test("lights the tile under the pointer", async () => {
  const { link } = await tileOn("windows");

  await userEvent.hover(link);

  await vi.waitFor(() => {
    expect(boxOfTile(link).backgroundColor).toBe("rgba(0, 0, 0, 0.035)");
  });
});

test("rings the picked tile's edge in the accent and draws no outline round its cover", async () => {
  const { link, mark } = await pickedTile(true);

  expect(boxOfTile(link).borderTopColor).toBe("rgb(47, 111, 79)");
  expect(styleOf(mark.parentElement).outlineStyle).toBe("none");
});

test("leaves an unpicked tile's edge clear while it is selecting", async () => {
  const { link } = await pickedTile(false);

  expect(boxOfTile(link).borderTopColor).toBe("rgba(0, 0, 0, 0)");
});

test("puts the unread count top left as a 16 tall accent pill in on-accent text", async () => {
  const { cover } = await tileOn("windows");
  const series = await oneSeries();
  await render(CoverBadges, { series, onCovers: ON_COVERS });
  const unread = page.getByRole("img", { name: "3 unread" }).last().element();
  const style = styleOf(unread);

  expect([
    unread.getBoundingClientRect().height,
    Number.parseFloat(style.borderTopLeftRadius) >= 8,
    style.backgroundColor,
    style.color,
  ]).toEqual([16, true, "rgb(47, 111, 79)", "rgb(255, 255, 255)"]);
  expect(cover).toBeInstanceOf(HTMLElement);
  expect(drawnContrast(unread)).toBeGreaterThanOrEqual(TEXT_CONTRAST);
});

test("sets the downloaded tag as a 16 accent dot", async () => {
  await drawOn("windows", "light");
  const series = await oneSeries();
  await render(CoverBadges, { series, onCovers: ON_COVERS });
  const downloaded = page
    .getByRole("img", { name: "Downloaded chapters" })
    .last()
    .element();

  expect([
    downloaded.getBoundingClientRect().height,
    styleOf(downloaded).backgroundColor,
  ]).toEqual([16, "rgb(47, 111, 79)"]);
});

test("draws the check box as a 20 square with a 4 corner, 8 inside the cover's top right", async () => {
  const { mark, link } = await pickedTile(false);
  const cover = mark.parentElement as HTMLElement;
  const style = styleOf(mark);

  expect([
    style.width,
    style.height,
    style.borderTopLeftRadius,
    style.backgroundColor,
    style.borderTopColor,
  ]).toEqual([
    "20px",
    "20px",
    "4px",
    "rgba(255, 255, 255, 0.79)",
    "rgb(107, 107, 107)",
  ]);
  expect(gapsAround(mark, cover)).toMatchObject({
    top: 8 + COVER_EDGE,
    end: 8 + COVER_EDGE,
  });
  expect(link).toBeInstanceOf(HTMLElement);
});

test("fills a picked check box with the accent and a 12 tick in on-accent", async () => {
  const { mark } = await pickedTile(true);
  const tick = mark.querySelector("svg");

  expect([
    styleOf(mark).backgroundColor,
    styleOf(mark).color,
    tick?.getBoundingClientRect().width,
  ]).toEqual(["rgb(47, 111, 79)", "rgb(255, 255, 255)", 12]);
});

for (const theme of ["light", "dark"] as const) {
  test(`keeps the empty check box's edge 3 to 1 against the lightest and darkest cover under it in the ${theme} theme`, async () => {
    await pickedTile(false, theme);
    const root = document.documentElement;
    root.style.setProperty("--probe-lightest", LIGHTEST_COVER_UNDER_THE_CHECK);
    root.style.setProperty("--probe-darkest", DARKEST_COVER_UNDER_THE_CHECK);
    const edge = "--native-color-tile-check-edge";

    const ratios = [
      contrastRatio(edge, "--probe-lightest"),
      contrastRatio(edge, "--probe-darkest"),
    ];

    expect(Math.max(...ratios)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
    expect(ratios[theme === "light" ? 0 : 1]).toBeGreaterThanOrEqual(
      GRAPHIC_CONTRAST,
    );
    root.style.removeProperty("--probe-lightest");
    root.style.removeProperty("--probe-darkest");
  });
}

test("leaves Linux's tile with no edge", async () => {
  const { link } = await tileOn("linux");

  expect(styleOf(link).borderTopWidth).toBe("0px");
});
