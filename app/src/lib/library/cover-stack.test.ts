import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import {
  commands,
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
  type LibrarySeries,
  type Platform,
} from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import type { CoverPath } from "./cover-url";
import { NEW_LIBRARY_LISTING } from "./library-listing";
import SeriesCovers from "./SeriesCovers.svelte";

const DESKTOP = { width: 1280, height: 800 };
const STACKED = "Sample Series 01";
const ONE_SHOT = "Sample Series 05";
const COVER_DISPLAYS: readonly LibraryDisplay[] = ["grid", "compact", "covers"];

async function listed(): Promise<readonly LibrarySeries[]> {
  mockIPC(() => ({
    series: [
      {
        id: "0190a3e4-0000-8000-8000-0000000000a1",
        title: STACKED,
        bookCount: 12,
        unreadCount: 3,
        cover: null,
        isConnected: true,
      },
      {
        id: "0190a3e4-0000-8000-8000-0000000000a5",
        title: ONE_SHOT,
        bookCount: 1,
        unreadCount: 1,
        cover: null,
        isConnected: true,
      },
    ],
    next: null,
  }));
  const listing = await commands.librarySeries(null, NEW_LIBRARY_LISTING);
  if (listing.status === "error") {
    throw new Error("the backend listed no series");
  }
  return listing.data.series;
}

interface Drawn {
  readonly sheets: number;
  readonly sheetsAboveCover: boolean;
  readonly coverTop: number;
  readonly cellTop: number;
  readonly badgeBelowCoverTop: number;
}

async function drawnOn(
  platform: Platform,
  shown: { readonly stacks: boolean; readonly display: LibraryDisplay },
): Promise<Record<string, Drawn>> {
  followCorePlatform(platform);
  const screen = await render(SeriesCovers, {
    series: await listed(),
    isComplete: true,
    coverUrl: (path: CoverPath) => `omni://localhost/${path}`,
    view: {
      ...DEFAULT_LIBRARY_VIEW,
      display: shown.display,
      stacksSeriesCovers: shown.stacks,
    },
    usesStandIns: false,
  });
  await expect.element(screen.getByRole("link").first()).toBeVisible();
  const cells = screen.container.querySelectorAll("[data-series-id]");
  return Object.fromEntries(
    [...cells].map((cell, index) => {
      const cover = cell.querySelector(".aspect-cover");
      const badge = cell.querySelector('[role="img"]');
      if (cover === null || badge === null) {
        throw new Error("the cell drew no cover or no unread badge");
      }
      const sheets = [
        ...cell.querySelectorAll('[data-slot="cover-sheet"]'),
      ].map((sheet) => sheet.getBoundingClientRect());
      const coverBox = cover.getBoundingClientRect();
      return [
        index === 0 ? STACKED : ONE_SHOT,
        {
          sheets: sheets.length,
          sheetsAboveCover: sheets.every(
            (sheet) => sheet.height > 0 && sheet.top < coverBox.top,
          ),
          coverTop: coverBox.top,
          cellTop: cell.getBoundingClientRect().top,
          badgeBelowCoverTop: badge.getBoundingClientRect().top - coverBox.top,
        },
      ];
    }),
  );
}

beforeEach(async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

afterEach(() => {
  clearMocks();
  delete document.documentElement.dataset.platform;
  document.body.replaceChildren();
});

test.each(COVER_DISPLAYS)(
  "draws two sheets behind a series of many books on linux, in the %s display",
  async (display) => {
    const drawn = await drawnOn("linux", { stacks: true, display });

    expect(drawn[STACKED]).toMatchObject({
      sheets: 2,
      sheetsAboveCover: true,
    });
  },
);

test("leaves a one-shot a single cover in line with the stacks", async () => {
  const drawn = await drawnOn("linux", { stacks: true, display: "grid" });

  expect(drawn[ONE_SHOT]?.sheets).toBe(0);
  expect(drawn[ONE_SHOT]?.coverTop).toBe(drawn[STACKED]?.coverTop);
  expect(drawn[STACKED]?.coverTop).toBeGreaterThan(
    drawn[STACKED]?.cellTop ?? 0,
  );
});

test("moves the unread badge down with the cover", async () => {
  const flat = await drawnOn("linux", { stacks: false, display: "grid" });
  document.body.replaceChildren();
  const stacked = await drawnOn("linux", { stacks: true, display: "grid" });

  expect(stacked[STACKED]?.badgeBelowCoverTop).toBe(
    flat[STACKED]?.badgeBelowCoverTop,
  );
  expect(stacked[STACKED]?.coverTop).toBeGreaterThan(
    flat[STACKED]?.coverTop ?? 0,
  );
});

test("draws flat covers when stacking is switched off", async () => {
  const drawn = await drawnOn("linux", { stacks: false, display: "grid" });

  expect(drawn[STACKED]?.sheets).toBe(0);
  expect(drawn[STACKED]?.coverTop).toBe(drawn[STACKED]?.cellTop);
});

test.each<Platform>(["macos", "windows", "ios", "android"])(
  "keeps today's flat covers on %s",
  async (platform) => {
    const drawn = await drawnOn(platform, { stacks: true, display: "grid" });

    expect(drawn[STACKED]?.sheets).toBe(0);
  },
);
