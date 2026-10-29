import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import { commands, type LibrarySeries } from "#lib/ipc/bindings.ts";
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
  }).toEqual({
    titleSize: "17px",
    titleWeight: "400",
    reasonSize: "15px",
    booksSize: "15px",
    headingSize: "17px",
    headingWeight: "590",
  });
});
