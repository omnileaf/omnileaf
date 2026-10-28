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
  type OnCovers,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";
import { Selection } from "#lib/page/selection.svelte.ts";
import type { SeriesId } from "#lib/series/series-id.ts";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import CoverBadges from "./CoverBadges.svelte";
import type { CoverPath } from "./cover-url";
import { NEW_LIBRARY_LISTING } from "./library-listing";
import SelectingCoversHarness from "./SelectingCoversHarness.svelte";
import SeriesCovers from "./SeriesCovers.svelte";

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1280, height: 800 };
const ON_COVERS: OnCovers = {
  ...DEFAULT_LIBRARY_VIEW.onCovers,
  showsUnreadCount: true,
  showsDownloaded: true,
  showsLanguage: true,
};

interface TileLook {
  readonly cover: { readonly corner: string };
  readonly badge: {
    readonly height: number;
    readonly corner: string;
    readonly fill: string;
    readonly label: string;
  };
  readonly downloaded: { readonly size: number; readonly fill: string };
  readonly mark: {
    readonly size: number;
    readonly corner: string;
    readonly fill: string;
    readonly tick: string;
  };
  readonly emptyMark: { readonly edge: string; readonly ring: string };
}

/** Chromium snaps border widths down to whole device pixels. */
function snappedBorder(width: number): string {
  return `${String(Math.floor(width * devicePixelRatio) / devicePixelRatio)}px`;
}

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

const SHADOW_LAYERS = /,(?![^(]*\))/;
const CLEAR_SHADOW = "rgba(0, 0, 0, 0) ";

function visibleShadows(boxShadow: string): string {
  const shown = boxShadow
    .split(SHADOW_LAYERS)
    .map((layer) => layer.trim())
    .filter((layer) => !layer.startsWith(CLEAR_SHADOW));
  return shown.length > 0 ? shown.join(", ") : "none";
}

function coversOf(series: LibrarySeries, display: LibraryDisplay) {
  return {
    series: [series],
    isComplete: true,
    coverUrl: (path: CoverPath) => `omni://localhost/${path}`,
    view: { ...DEFAULT_LIBRARY_VIEW, display },
    usesStandIns: false,
  };
}

async function coverOf(series: LibrarySeries): Promise<Element> {
  const screen = await render(SeriesCovers, coversOf(series, "grid"));
  return (
    screen.getByRole("presentation").element().parentElement ?? document.body
  );
}

async function markOf(
  series: LibrarySeries,
  shown: { readonly isOn: boolean; readonly display: LibraryDisplay },
): Promise<Element> {
  const selection = new Selection<SeriesId>();
  selection.begin(shown.isOn ? series.id : undefined);
  const screen = await render(SelectingCoversHarness, {
    selection,
    ...coversOf(series, shown.display),
  });
  return vi.waitFor(() => {
    const mark = screen.container.querySelector('[data-slot="selection-mark"]');
    if (mark === null) {
      throw new Error("the cell drew no selection mark");
    }
    return mark;
  });
}

async function lookOn(platform: Platform, theme: string): Promise<TileLook> {
  document.body.replaceChildren();
  document.documentElement.dataset.theme = theme;
  followCorePlatform(platform);
  const series = await oneSeries();
  const cover = await coverOf(series);
  await render(CoverBadges, { series, onCovers: ON_COVERS });
  const unread = page.getByRole("img", { name: "3 unread" }).last().element();
  const downloaded = page
    .getByRole("img", { name: "Downloaded chapters" })
    .last()
    .element();
  const mark = styleOf(await markOf(series, { isOn: true, display: "grid" }));
  const emptyMark = styleOf(
    await markOf(series, { isOn: false, display: "grid" }),
  );

  return {
    cover: { corner: styleOf(cover).borderTopLeftRadius },
    badge: {
      height: unread.getBoundingClientRect().height,
      corner: styleOf(unread).borderTopLeftRadius,
      fill: styleOf(unread).backgroundColor,
      label: styleOf(unread).color,
    },
    downloaded: {
      size: downloaded.getBoundingClientRect().height,
      fill: styleOf(downloaded).backgroundColor,
    },
    mark: {
      size: Number.parseFloat(mark.height),
      corner: mark.borderTopLeftRadius,
      fill: mark.backgroundColor,
      tick: mark.color,
    },
    emptyMark: {
      edge: `${emptyMark.borderTopWidth} ${emptyMark.borderTopColor}`,
      ring: visibleShadows(emptyMark.boxShadow),
    },
  };
}

beforeEach(async () => {
  await page.viewport(PHONE.width, PHONE.height);
});

afterEach(() => {
  clearMocks();
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

test("draws iOS's tile with glass badges and edit-mode select circles", async () => {
  const look = await lookOn("ios", "light");

  expect(look).toEqual({
    cover: { corner: "6px" },
    badge: {
      height: 20,
      corner: "6px",
      fill: "rgba(255, 255, 255, 0.78)",
      label: "rgb(0, 0, 0)",
    },
    downloaded: { size: 20, fill: "rgba(255, 255, 255, 0.78)" },
    mark: {
      size: 22,
      corner: "999px",
      fill: "rgb(47, 111, 79)",
      tick: "rgb(255, 255, 255)",
    },
    emptyMark: {
      edge: `${snappedBorder(1.5)} rgb(255, 255, 255)`,
      ring: "rgba(0, 0, 0, 0.3) 0px 1px 3px 0px",
    },
  });
});

test("darkens iOS's glass badges in the dark theme", async () => {
  const look = await lookOn("ios", "dark");

  expect([
    look.badge.fill,
    look.badge.label,
    look.mark.fill,
    look.mark.tick,
  ]).toEqual([
    "rgba(44, 44, 46, 0.72)",
    "rgb(255, 255, 255)",
    "rgb(127, 203, 157)",
    "rgb(15, 36, 24)",
  ]);
});

test("draws Android's tile with a download dot and a material check box", async () => {
  const look = await lookOn("android", "light");

  expect(look).toEqual({
    cover: { corner: "4px" },
    badge: {
      height: 24,
      corner: "8px",
      fill: "rgb(208, 232, 215)",
      label: "rgb(65, 87, 73)",
    },
    downloaded: { size: 6, fill: "rgb(50, 106, 77)" },
    mark: {
      size: 18,
      corner: "2px",
      fill: "rgb(50, 106, 77)",
      tick: "rgb(230, 255, 237)",
    },
    emptyMark: { edge: "2px rgb(115, 125, 117)", ring: "none" },
  });
});

test("tints Android's check box and badges for the dark theme", async () => {
  const look = await lookOn("android", "dark");

  expect([
    look.badge.fill,
    look.badge.label,
    look.mark.fill,
    look.mark.tick,
    look.emptyMark.edge,
  ]).toEqual([
    "rgb(43, 64, 51)",
    "rgb(173, 197, 180)",
    "rgb(164, 209, 180)",
    "rgb(31, 72, 51)",
    "2px rgb(110, 120, 112)",
  ]);
});

test("keeps linux's cover and marks as they were", async () => {
  const look = await lookOn("linux", "light");

  expect([
    look.cover.corner,
    look.downloaded.size,
    look.mark.size,
    look.mark.corner,
    look.emptyMark.ring,
  ]).toEqual(["6px", 22, 22, "6px", "none"]);
});

test("draws linux's unread count as a 22px badge with 8px sides and 8px corners on the primary", async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("linux");
  const series = await oneSeries();

  await render(CoverBadges, { series, onCovers: ON_COVERS });
  const unread = page.getByRole("img", { name: "3 unread" }).element();
  const style = styleOf(unread);

  expect([
    unread.getBoundingClientRect().height,
    style.paddingBlockStart,
    style.paddingInlineStart,
    style.borderTopWidth,
    style.borderTopLeftRadius,
    style.backgroundColor,
    style.fontSize,
    style.lineHeight,
    style.fontWeight,
  ]).toEqual([
    22,
    "2px",
    "8px",
    "1px",
    "8px",
    resolvedColour("--primary", "backgroundColor"),
    "12px",
    "16px",
    "500",
  ]);
});

test("keeps a tablet's tile as it was on iOS and Android", async () => {
  await page.viewport(TABLET.width, TABLET.height);

  const looks = [
    await lookOn("ios", "light"),
    await lookOn("android", "light"),
  ];

  expect(
    looks.map(({ cover, badge, downloaded, mark }) => [
      cover.corner,
      badge.height,
      downloaded.size,
      mark.size,
      mark.corner,
    ]),
  ).toEqual([
    ["6px", 24, 22, 22, "6px"],
    ["6px", 24, 22, 22, "6px"],
  ]);
});

test("keeps a list row's marks as they were on an iOS phone", async () => {
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  const series = await oneSeries();

  const mark = styleOf(await markOf(series, { isOn: true, display: "list" }));
  const markLook = [Number.parseFloat(mark.height), mark.borderTopLeftRadius];
  document.body.replaceChildren();
  await render(SeriesCovers, coversOf(series, "list"));
  const downloaded = page
    .getByRole("img", { name: "Downloaded chapters" })
    .element();

  expect([
    ...markLook,
    downloaded.getBoundingClientRect().height,
    styleOf(downloaded).backdropFilter,
  ]).toEqual([22, "6px", 22, "none"]);
});
