import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import {
  commands,
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
  type LibrarySeries,
} from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { Selection } from "#lib/page/selection.svelte.ts";
import type { SeriesId } from "#lib/series/series-id.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { CoverPath } from "./cover-url";
import { NEW_LIBRARY_LISTING } from "./library-listing";
import SelectingCoversHarness from "./SelectingCoversHarness.svelte";

const PHONE = { width: 390, height: 844 };
const LIGHT_ACCENT = "rgb(50, 106, 77)";
const LIGHT_ON_ACCENT = "rgb(230, 255, 237)";
const DARK_ACCENT = "rgb(120, 217, 159)";
const CLEAR = "rgba(0, 0, 0, 0)";
const FRAME_INSET_PX = 4;
const FRAME_CORNER = "12px";

async function twoSeries(): Promise<readonly LibrarySeries[]> {
  mockIPC(() => ({
    series: ["a1", "a2"].map((end, index) => ({
      id: `0190a3e4-0000-8000-8000-0000000000${end}`,
      title: index === 0 ? "Harbour Lights" : "Salt Roads",
      bookCount: 4,
      unreadCount: 3,
      cover: `thumb/v1/0190a3e4-0000-8000-8000-00000000000${String(index)}/1/1`,
      language: "ja",
      hasDownloads: false,
      isConnected: true,
    })),
    next: null,
  }));
  const listed = await commands.librarySeries(null, NEW_LIBRARY_LISTING);
  if (listed.status !== "ok") {
    throw new Error("the backend listed no series");
  }
  return listed.data.series;
}

async function choosing(display: LibraryDisplay): Promise<HTMLElement> {
  const series = await twoSeries();
  const [chosen] = series;
  const selection = new Selection<SeriesId>();
  selection.begin(chosen?.id);
  const screen = await render(SelectingCoversHarness, {
    selection,
    series,
    isComplete: true,
    coverUrl: (path: CoverPath) => `omni://localhost/${path}`,
    view: { ...DEFAULT_LIBRARY_VIEW, display },
    usesStandIns: false,
  });
  await vi.waitFor(() => {
    if (screen.container.querySelector('[aria-checked="true"]') === null) {
      throw new Error("no series is chosen yet");
    }
  });
  return screen.container;
}

function tileOf(root: HTMLElement, state: "true" | "false"): HTMLElement {
  const tile = root.querySelector<HTMLElement>(`[aria-checked="${state}"]`);
  if (tile === null) {
    throw new Error(`no tile has aria-checked ${state}`);
  }
  return tile;
}

function coverOf(tile: HTMLElement): HTMLElement {
  const cover = tile.querySelector("img")?.parentElement;
  if (!(cover instanceof HTMLElement)) {
    throw new Error("the tile drew no cover");
  }
  return cover;
}

beforeEach(async () => {
  await page.viewport(PHONE.width, PHONE.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("android");
});

afterEach(() => {
  clearMocks();
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test.each<LibraryDisplay>(["grid", "compact", "covers", "list"])(
  "draws no check mark on an Android phone's %s while choosing",
  async (display) => {
    const root = await choosing(display);

    expect(root.querySelectorAll('[data-slot="selection-mark"]')).toHaveLength(
      0,
    );
  },
);

test("fills a chosen Android tile behind its cover and title with the accent", async () => {
  const tile = tileOf(await choosing("grid"), "true");
  const frame = getComputedStyle(tile, "::before");
  const tileBox = tile.getBoundingClientRect();
  const coverBox = coverOf(tile).getBoundingClientRect();

  expect(frame.backgroundColor).toBe(LIGHT_ACCENT);
  expect(frame.borderTopLeftRadius).toBe(FRAME_CORNER);
  expect(Number.parseFloat(frame.height)).toBeGreaterThan(tileBox.height);
  expect(coverBox.left - tileBox.left).toBeGreaterThanOrEqual(FRAME_INSET_PX);
  expect(tileBox.right - coverBox.right).toBeGreaterThanOrEqual(FRAME_INSET_PX);
});

test("dims a chosen Android cover to 76% over the accent", async () => {
  const cover = coverOf(tileOf(await choosing("grid"), "true"));

  expect(getComputedStyle(cover).opacity).toBe("0.76");
});

test("sets a chosen Android tile's title and book count on the accent's text colour", async () => {
  const tile = tileOf(await choosing("grid"), "true");
  const [title, books] = tile.querySelectorAll("p");

  expect([
    title && getComputedStyle(title).color,
    books && getComputedStyle(books).color,
  ]).toEqual([LIGHT_ON_ACCENT, LIGHT_ON_ACCENT]);
});

test("leaves an unchosen Android tile without a frame and its cover at full strength", async () => {
  const tile = tileOf(await choosing("grid"), "false");
  const cover = coverOf(tile);

  expect(getComputedStyle(tile, "::before").backgroundColor).toBe(CLEAR);
  expect(getComputedStyle(cover).opacity).toBe("1");
});

test("frames a chosen compact Android cover in the dark theme's accent", async () => {
  document.documentElement.dataset.theme = "dark";

  const tile = tileOf(await choosing("compact"), "true");

  expect(getComputedStyle(tile, "::before").backgroundColor).toBe(DARK_ACCENT);
});

test("tints a chosen Android list row with the accent", async () => {
  const root = await choosing("list");
  const tint = resolvedColour(
    "color-mix(in oklab, var(--color-native-cover-accent) 20%, transparent)",
    "backgroundColor",
  );

  expect([
    getComputedStyle(tileOf(root, "true")).backgroundColor,
    getComputedStyle(tileOf(root, "false")).backgroundColor,
  ]).toEqual([tint, CLEAR]);
});
