import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import {
  commands,
  DEFAULT_LIBRARY_VIEW,
  type LibraryDisplay,
  type LibrarySeries,
  type LibraryView,
  type Platform,
} from "#lib/ipc/bindings.ts";

import { followCorePlatform } from "#lib/page/platform.ts";

import type { CoverPath } from "./cover-url";
import SeriesCovers from "./SeriesCovers.svelte";
import { NEW_LIBRARY_LISTING } from "./library-listing";

const ANDROID_PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;
const COVER = "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1";

afterEach(() => {
  clearMocks();
});

async function listed(): Promise<readonly LibrarySeries[]> {
  mockIPC(() => ({
    series: [
      {
        id: "0190a3e4-0000-8000-8000-0000000000a1",
        title: "Sample Series 01",
        bookCount: 3,
        unreadCount: 3,
        isConnected: true,
        cover: COVER,
      },
      {
        id: "0190a3e4-0000-8000-8000-0000000000a2",
        title: "Sample Series 02",
        bookCount: 1,
        unreadCount: 1,
        isConnected: true,
        cover: null,
      },
    ],
    next: null,
  }));
  const page = await commands.librarySeries(null, NEW_LIBRARY_LISTING);
  if (page.status === "error") {
    throw new Error("the backend listed no series");
  }
  return page.data.series;
}

const fakeCoverUrl = (path: CoverPath): string => `omni://localhost/${path}`;

test("lists each series with its title and how many books it holds", async () => {
  const series = await listed();

  const screen = await render(SeriesCovers, {
    series,
    isComplete: true,
    coverUrl: fakeCoverUrl,
    view: DEFAULT_LIBRARY_VIEW,
    usesStandIns: false,
  });

  const items = screen
    .getByRole("list", { name: "Series" })
    .getByRole("listitem");
  await expect
    .element(items.nth(0).getByText("Sample Series 01"))
    .toBeVisible();
  await expect.element(items.nth(0).getByText("3 books")).toBeVisible();
  await expect
    .element(items.nth(1).getByText("Sample Series 02"))
    .toBeVisible();
  await expect.element(items.nth(1).getByText("1 book")).toBeVisible();
});

test("shows a series' cover from the omni protocol", async () => {
  const series = await listed();

  const screen = await render(SeriesCovers, {
    series,
    isComplete: true,
    coverUrl: fakeCoverUrl,
    view: DEFAULT_LIBRARY_VIEW,
    usesStandIns: false,
  });

  const first = screen.getByRole("listitem").nth(0);
  await expect
    .element(first.getByRole("presentation"))
    .toHaveAttribute("src", `omni://localhost/${COVER}`);
});

test("leaves the cover's place empty for a series with no cover yet", async () => {
  const series = await listed();

  const screen = await render(SeriesCovers, {
    series,
    isComplete: true,
    coverUrl: fakeCoverUrl,
    view: DEFAULT_LIBRARY_VIEW,
    usesStandIns: false,
  });

  const second = screen.getByRole("listitem").nth(1);
  await expect.element(second.getByText("Sample Series 02")).toBeVisible();
  expect(second.getByRole("presentation").elements()).toHaveLength(0);
});

test("opens each series on a page of its own", async () => {
  const series = await listed();

  const screen = await render(SeriesCovers, {
    series,
    isComplete: true,
    coverUrl: fakeCoverUrl,
    view: DEFAULT_LIBRARY_VIEW,
    usesStandIns: false,
  });

  const links = screen.getByRole("listitem").getByRole("link");
  await expect
    .element(links.nth(0))
    .toHaveAttribute("href", "/series/0190a3e4-0000-8000-8000-0000000000a1");
  await expect
    .element(links.nth(1))
    .toHaveAttribute("href", "/series/0190a3e4-0000-8000-8000-0000000000a2");
  await expect.element(links.nth(0)).toHaveAccessibleName(/Sample Series 01/);
});

test("keeps each series' cover with its series when the list reorders", async () => {
  const series = await listed();
  const screen = await render(SeriesCovers, {
    series,
    isComplete: true,
    coverUrl: fakeCoverUrl,
    view: DEFAULT_LIBRARY_VIEW,
    usesStandIns: false,
  });
  const cover = screen.getByRole("presentation").element();

  await screen.rerender({ series: series.toReversed() });

  const moved = screen.getByRole("listitem").nth(1);
  expect(moved.getByRole("presentation").element()).toBe(cover);
});

async function listMarkupOn(
  platform: Platform,
  display: LibraryDisplay,
): Promise<string> {
  followCorePlatform(platform);
  await page.viewport(ANDROID_PHONE_WIDTH, PHONE_HEIGHT);
  const screen = await render(SeriesCovers, {
    series: await listed(),
    isComplete: true,
    coverUrl: fakeCoverUrl,
    view: { ...DEFAULT_LIBRARY_VIEW, display },
    usesStandIns: false,
  });

  const markup = screen
    .getByRole("list", { name: "Series" })
    .element().innerHTML;
  await screen.unmount();

  return markup;
}

test("lays the covers display out as the grid on an Android phone", async () => {
  const covers = await listMarkupOn("android", "covers");
  const grid = await listMarkupOn("android", "grid");

  expect(covers).toBe(grid);
});

test("lays the covers display out apart from the grid on a Windows window", async () => {
  const covers = await listMarkupOn("windows", "covers");
  const grid = await listMarkupOn("windows", "grid");

  expect(covers).not.toBe(grid);
});

async function countedOn(platform: Platform, view: LibraryView) {
  followCorePlatform(platform);
  await page.viewport(ANDROID_PHONE_WIDTH, PHONE_HEIGHT);
  mockIPC(() => ({
    series: [
      {
        id: "0190a3e4-0000-8000-8000-0000000000a1",
        title: "Sample Series 01",
        bookCount: 18,
        volumeCount: 12,
        chapterCount: 6,
        unreadCount: 0,
        isConnected: true,
        cover: COVER,
      },
    ],
    next: null,
  }));
  const listing = await commands.librarySeries(null, NEW_LIBRARY_LISTING);
  if (listing.status === "error") {
    throw new Error("the backend listed no series");
  }
  return render(SeriesCovers, {
    series: listing.data.series,
    isComplete: true,
    coverUrl: fakeCoverUrl,
    view,
    usesStandIns: false,
  });
}

function withVolumeAndChapterCounts(
  display: LibraryDisplay,
  isOn: boolean,
): LibraryView {
  return {
    ...DEFAULT_LIBRARY_VIEW,
    display,
    onCovers: {
      ...DEFAULT_LIBRARY_VIEW.onCovers,
      showsVolumeAndChapterCounts: isOn,
    },
  };
}

test("draws only the title under a cover on android while the volume and chapter counts are off", async () => {
  const screen = await countedOn(
    "android",
    withVolumeAndChapterCounts("grid", false),
  );

  const tile = screen.getByRole("listitem");
  await expect.element(tile.getByText("Sample Series 01")).toBeVisible();
  expect(tile.getByText("12 volumes · 6 chapters").elements()).toHaveLength(0);
});

test("draws the volume and chapter count under a cover on android once they are on", async () => {
  const screen = await countedOn(
    "android",
    withVolumeAndChapterCounts("grid", true),
  );

  await expect
    .element(screen.getByRole("listitem").getByText("12 volumes · 6 chapters"))
    .toBeVisible();
});

test("keeps the volume and chapter count in a list row on android whether the option is on or off", async () => {
  for (const isOn of [false, true]) {
    const screen = await countedOn(
      "android",
      withVolumeAndChapterCounts("list", isOn),
    );

    await expect
      .element(
        screen.getByRole("listitem").getByText("12 volumes · 6 chapters"),
      )
      .toBeVisible();
    await screen.unmount();
  }
});

test("keeps counting books under a cover on windows whatever the option says", async () => {
  for (const isOn of [false, true]) {
    const screen = await countedOn(
      "windows",
      withVolumeAndChapterCounts("grid", isOn),
    );

    await expect
      .element(screen.getByRole("listitem").getByText("18 books"))
      .toBeVisible();
    await screen.unmount();
  }
});
