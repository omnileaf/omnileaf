import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import {
  commands,
  type LibrarySeries,
  type Platform,
} from "#lib/ipc/bindings.ts";
import type { CoverPath } from "#lib/library/cover-url.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import SearchResults from "./SearchResults.svelte";
import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";

const REAL_TITLE = "Hidden Story";
const STAND_IN = /^Series \d{2,3}$/;

afterEach(() => {
  clearMocks();
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
});

async function foundSeries(): Promise<readonly LibrarySeries[]> {
  mockIPC(() => ({
    series: [
      {
        id: "0190a3e4-0000-8000-8000-0000000000a1",
        title: REAL_TITLE,
        bookCount: 3,
        unreadCount: 3,
        cover: "thumb/v1/0190a3e4-0000-8000-8000-0000000000a1/1/1",
      },
    ],
    next: null,
  }));
  const page = await commands.librarySearch(null, {
    text: "hidden",
    filter: NEW_LIBRARY_LISTING.filter,
  });
  if (page.status === "error") {
    throw new Error("the backend found no series");
  }
  return page.data.series;
}

const fakeCoverUrl = (path: CoverPath): string => `omni://localhost/${path}`;

test("shows a stand-in for each title and no cover while Screenshot mode is on", async () => {
  const screen = await render(SearchResults, {
    series: await foundSeries(),
    count: 1,
    isComplete: true,
    onNearEnd: () => undefined,
    coverUrl: fakeCoverUrl,
    usesStandIns: true,
    listId: "results",
    activeKey: undefined,
    onOpen: () => undefined,
    onSelect: () => undefined,
    words: "",
    view: undefined,
  });

  const found = screen.getByRole("option").nth(0);
  await expect.element(found.getByText(STAND_IN)).toBeVisible();
  expect(found.getByText(REAL_TITLE).elements()).toHaveLength(0);
  expect(found.getByRole("presentation").elements()).toHaveLength(0);
});

test("shows each real title and cover while Screenshot mode is off", async () => {
  const screen = await render(SearchResults, {
    series: await foundSeries(),
    count: 1,
    isComplete: true,
    onNearEnd: () => undefined,
    coverUrl: fakeCoverUrl,
    usesStandIns: false,
    listId: "results",
    activeKey: undefined,
    onOpen: () => undefined,
    onSelect: () => undefined,
    words: "",
    view: undefined,
  });

  const found = screen.getByRole("option").nth(0);
  await expect.element(found.getByText(REAL_TITLE)).toBeVisible();
  await expect.element(found.getByRole("presentation")).toBeInTheDocument();
});

test("marks the matched word on the accent-soft fill on an iPhone", async () => {
  await page.viewport(390, 800);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  const screen = await render(SearchResults, {
    series: await foundSeries(),
    count: 1,
    isComplete: true,
    onNearEnd: () => undefined,
    coverUrl: fakeCoverUrl,
    usesStandIns: false,
    listId: "results",
    activeKey: undefined,
    onOpen: () => undefined,
    onSelect: () => undefined,
    words: "hidden",
    view: undefined,
  });

  const mark = screen.getByText("Hidden", { exact: true }).element();

  expect(getComputedStyle(mark).backgroundColor).toBe(
    resolvedColour("--color-native-accent-soft", "backgroundColor"),
  );
});

test("sets a result in 17 point regular type over two 15 point muted lines, under a semibold heading, on an iPhone", async () => {
  await page.viewport(390, 800);
  document.documentElement.dataset.theme = "light";
  followCorePlatform("ios");
  const screen = await render(SearchResults, {
    series: await foundSeries(),
    count: 1,
    isComplete: true,
    onNearEnd: () => undefined,
    coverUrl: fakeCoverUrl,
    usesStandIns: false,
    listId: "results",
    activeKey: undefined,
    onOpen: () => undefined,
    onSelect: () => undefined,
    words: "hidden",
    view: undefined,
  });

  const found = screen.getByRole("option").nth(0);
  const title = getComputedStyle(
    found.getByText("Hidden", { exact: true }).element().parentElement ??
      document.body,
  );
  const reason = getComputedStyle(
    found.getByText("Title", { exact: true }).element(),
  );
  const books = getComputedStyle(found.getByText("3 books").element());
  const heading = getComputedStyle(
    screen.getByRole("heading", { level: 2 }).element(),
  );

  expect({
    titleSize: title.fontSize,
    titleWeight: title.fontWeight,
    reasonSize: reason.fontSize,
    booksSize: books.fontSize,
    headingSize: heading.fontSize,
    headingWeight: heading.fontWeight,
    headingInk: heading.color,
    lineInk: reason.color,
  }).toEqual({
    titleSize: "17px",
    titleWeight: "400",
    reasonSize: "15px",
    booksSize: "15px",
    headingSize: "17px",
    headingWeight: "590",
    headingInk: resolvedColour("--color-muted", "color"),
    lineInk: resolvedColour("--color-muted", "color"),
  });
});

const WIDE_WINDOW = 1280;
const NARROW_WINDOW = 800;

async function renderOn(
  platform: Platform,
  options: {
    onOpen?: (series: LibrarySeries) => void;
    onSelect?: (series: LibrarySeries) => void;
    activeKey?: string;
    theme?: "light" | "dark";
  } = {},
) {
  await page.viewport(WIDE_WINDOW, 800);
  document.documentElement.dataset.theme = options.theme ?? "light";
  followCorePlatform(platform);
  const series = await foundSeries();
  return render(SearchResults, {
    series,
    count: 1,
    isComplete: true,
    onNearEnd: () => undefined,
    coverUrl: fakeCoverUrl,
    usesStandIns: false,
    listId: "results",
    activeKey: options.activeKey,
    onOpen: options.onOpen ?? (() => undefined),
    onSelect: options.onSelect ?? (() => undefined),
    words: "hidden",
    view: undefined,
  });
}

test("selects a result with a click and opens it with a double click on a Mac", async () => {
  const onOpen = vi.fn();
  const onSelect = vi.fn();
  const screen = await renderOn("macos", { onOpen, onSelect });
  const option = screen.getByRole("option").nth(0);

  await option.click();

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onOpen).not.toHaveBeenCalled();

  await option.dblClick();

  expect(onOpen).toHaveBeenCalledTimes(1);
});

test.each(["windows", "linux"] as const)(
  "opens a result with one click and selects nothing on %s",
  async (platform) => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    const screen = await renderOn(platform, { onOpen, onSelect });

    await screen.getByRole("option").nth(0).click();

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  },
);

test.each(["light", "dark"] as const)(
  "marks the matched word in the warning colours in a %s Mac window",
  async (theme) => {
    const screen = await renderOn("macos", { theme });

    const mark = getComputedStyle(
      screen.getByText("Hidden", { exact: true }).element(),
    );

    expect({
      fill: mark.backgroundColor,
      ink: mark.color,
      radius: mark.borderRadius,
    }).toEqual({
      fill: resolvedColour("--color-warning-soft", "backgroundColor"),
      ink: resolvedColour("--color-on-warning", "color"),
      radius: "3px",
    });
  },
);

test("keeps the chip fill behind the matched word on Windows", async () => {
  const screen = await renderOn("windows");

  const mark = getComputedStyle(
    screen.getByText("Hidden", { exact: true }).element(),
  );

  expect(mark.backgroundColor).toBe(
    resolvedColour("--color-chip", "backgroundColor"),
  );
});

test("puts the title of the selected result on the accent, with no fill behind the result, on a Mac", async () => {
  const series = await foundSeries();
  const screen = await renderOn("macos", { activeKey: series[0]?.id ?? "" });
  const option = screen.getByRole("option").nth(0);

  const title = getComputedStyle(
    option.getByText("Hidden", { exact: true }).element().parentElement ??
      document.body,
  );
  const result = getComputedStyle(option.element());

  expect({
    titleFill: title.backgroundColor,
    titleRadius: title.borderRadius,
    resultFill: result.backgroundColor,
  }).toEqual({
    titleFill: resolvedColour("--color-accent", "backgroundColor"),
    titleRadius: "4px",
    resultFill: "rgba(0, 0, 0, 0)",
  });
});

test("sets the title in 13 point medium type and the reason in 11 point type, under a bold 13 point heading, on a Mac", async () => {
  const screen = await renderOn("macos");
  const option = screen.getByRole("option").nth(0);

  const title = getComputedStyle(
    option.getByText("Hidden", { exact: true }).element().parentElement ??
      document.body,
  );
  const reason = getComputedStyle(
    option.getByText("Title", { exact: true }).element(),
  );
  const heading = getComputedStyle(
    screen.getByRole("heading", { level: 2 }).element(),
  );

  expect({
    titleSize: title.fontSize,
    titleWeight: title.fontWeight,
    titleTracking: title.letterSpacing,
    reasonSize: reason.fontSize,
    reasonTracking: reason.letterSpacing,
    headingSize: heading.fontSize,
    headingWeight: heading.fontWeight,
  }).toEqual({
    titleSize: "13px",
    titleWeight: "510",
    titleTracking: "-0.08px",
    reasonSize: "11px",
    reasonTracking: "0.06px",
    headingSize: "13px",
    headingWeight: "700",
  });
});

test.each([{ width: WIDE_WINDOW }, { width: NARROW_WINDOW }])(
  "spaces the covers 20px across and 24px down at $width px on a Mac",
  async ({ width }) => {
    const screen = await renderOn("macos");
    await page.viewport(width, 800);

    const grid = getComputedStyle(screen.getByRole("listbox").element());

    expect({ across: grid.columnGap, down: grid.rowGap }).toEqual({
      across: "20px",
      down: "24px",
    });
  },
);
