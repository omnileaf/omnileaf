import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import {
  commands,
  DEFAULT_LIBRARY_VIEW,
  type LibrarySeries,
} from "#lib/ipc/bindings.ts";

import type { CoverPath } from "./cover-url";
import SeriesCovers from "./SeriesCovers.svelte";

const COVER = "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1";

afterEach(() => {
  clearMocks();
});

/** Series as only the backend hands them out, with their covers' paths branded. */
async function listed(): Promise<readonly LibrarySeries[]> {
  mockIPC(() => ({
    series: [
      {
        id: "0190a3e4-0000-8000-8000-0000000000a1",
        title: "Sample Series 01",
        bookCount: 3,
        unreadCount: 3,
        cover: COVER,
      },
      {
        id: "0190a3e4-0000-8000-8000-0000000000a2",
        title: "Sample Series 02",
        bookCount: 1,
        unreadCount: 1,
        cover: null,
      },
    ],
    next: null,
  }));
  const page = await commands.librarySeries(null);
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
