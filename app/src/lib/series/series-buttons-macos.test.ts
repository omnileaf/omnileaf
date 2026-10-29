import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import { resolvedColour } from "../../../tests/components/resolved-colour";

import type { SeriesBook, SeriesOverview } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ContinueLink from "./ContinueLink.svelte";
import SeriesActions from "./SeriesActions.svelte";

const DESKTOP = { width: 1280, height: 800 } as const;
const BOOK_ID = "0190a3e4-0000-8000-8000-0000000000b1" as SeriesBook["id"];
const SERIES_ID =
  "0190a3e4-0000-8000-8000-0000000000a1" as SeriesOverview["id"];

const BOOK: SeriesBook = {
  id: BOOK_ID,
  position: 1,
  title: "Volume 1",
  cover: null,
  addedAtMs: 0,
  reading: { state: "notStarted" },
  pageCount: 180,
  isBookmarked: false,
  isNew: false,
  isFileMissing: false,
  kind: null,
  numbers: null,
  volume: null,
  section: "volumes",
};

const OVERVIEW: SeriesOverview = {
  id: SERIES_ID,
  title: "Sample Series",
  year: null,
  bookCount: 3,
  readCount: 1,
  bookmarkCount: 0,
  cover: null,
  folder: null,
  upNext: BOOK,
  format: null,
  creators: [],
  summary: null,
  tags: [],
  related: [],
  secondsLeft: null,
  sections: [],
  missingVolumes: [],
  lastVolume: null,
};

afterEach(() => {
  delete document.documentElement.dataset.platform;
  delete document.documentElement.dataset.theme;
  document.body.replaceChildren();
});

async function onPlatform(platform: "macos" | "linux") {
  await page.viewport(DESKTOP.width, DESKTOP.height);
  document.documentElement.dataset.theme = "light";
  followCorePlatform(platform);
}

function asElement(element: Element): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new Error("the button drew no element");
  }
  return element;
}

test("draws Continue as macOS's 24 point primary button", async () => {
  await onPlatform("macos");
  await render(ContinueLink, { book: BOOK });

  const link = asElement(page.getByRole("link").element());
  const style = getComputedStyle(link);

  expect({
    height: link.getBoundingClientRect().height,
    radius: style.borderTopLeftRadius,
    fill: style.backgroundColor,
    size: style.fontSize,
  }).toEqual({
    height: 24,
    radius: "6px",
    fill: resolvedColour("--color-native-button-primary", "backgroundColor"),
    size: "13px",
  });
});

test("draws Tags and Mark read as macOS's secondary buttons", async () => {
  await onPlatform("macos");
  await render(SeriesActions, {
    overview: OVERVIEW,
    isWide: true,
    onMarkAll: () => Promise.resolve(),
  });

  for (const name of ["Tags", "Mark read"]) {
    const button = asElement(page.getByRole("button", { name }).element());
    const style = getComputedStyle(button);

    expect({
      name,
      height: button.getBoundingClientRect().height,
      radius: style.borderTopLeftRadius,
      fill: style.backgroundColor,
    }).toEqual({
      name,
      height: 24,
      radius: "6px",
      fill: resolvedColour(
        "--color-native-button-secondary",
        "backgroundColor",
      ),
    });
  }
});

test("keeps Continue, Tags and Mark read as they were on Linux", async () => {
  await onPlatform("linux");
  await render(SeriesActions, {
    overview: OVERVIEW,
    isWide: true,
    onMarkAll: () => Promise.resolve(),
  });
  await render(ContinueLink, { book: BOOK });

  expect(
    asElement(
      page.getByRole("button", { name: "Mark read" }).element(),
    ).getBoundingClientRect().height,
  ).toBeGreaterThan(24);
  expect(
    asElement(page.getByRole("link").element()).getBoundingClientRect().height,
  ).toBeGreaterThan(24);
});

test("keeps the unavailable Tags control hoverable and dimmed on macOS", async () => {
  await onPlatform("macos");
  await render(SeriesActions, {
    overview: OVERVIEW,
    isWide: true,
    onMarkAll: () => Promise.resolve(),
  });

  const style = getComputedStyle(
    asElement(page.getByRole("button", { name: "Tags" }).element()),
  );

  expect({ events: style.pointerEvents, ink: style.color }).toEqual({
    events: "auto",
    ink: resolvedColour("--color-native-on-button-disabled", "color"),
  });
});
