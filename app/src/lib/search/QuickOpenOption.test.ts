import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import {
  commands,
  DEFAULT_LIBRARY_LISTING,
  type LibrarySeries,
} from "#lib/ipc/bindings.ts";

import QuickOpenOption from "./QuickOpenOption.svelte";

const REAL_TITLE = "Hidden Story";
const STAND_IN = /^Series \d{2,3}$/;

async function found(): Promise<LibrarySeries> {
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
    filter: DEFAULT_LIBRARY_LISTING.filter,
  });
  const [series] = page.status === "ok" ? page.data.series : [];
  if (series === undefined) {
    throw new Error("the backend found no series");
  }
  return series;
}

beforeEach(() => {
  mockConvertFileSrc("linux");
});

afterEach(() => {
  clearMocks();
});

async function renderSeries(usesStandIns: boolean) {
  const series = await found();
  return render(QuickOpenOption, {
    id: "option",
    choice: { kind: "series", series },
    isActive: false,
    usesStandIns,
    onActivate: () => undefined,
    onChoose: () => undefined,
    onKeyDown: () => undefined,
  });
}

test("offers a series by a stand-in and no cover while Screenshot mode is on", async () => {
  const screen = await renderSeries(true);

  const option = screen.getByRole("option");
  await expect.element(option.getByText(STAND_IN)).toBeVisible();
  expect(option.getByText(REAL_TITLE).elements()).toHaveLength(0);
  expect(option.getByRole("presentation").elements()).toHaveLength(0);
});

test("offers a series by its real title and cover while Screenshot mode is off", async () => {
  const screen = await renderSeries(false);

  const option = screen.getByRole("option");
  await expect.element(option.getByText(REAL_TITLE)).toBeVisible();
  await expect.element(option.getByRole("presentation")).toBeInTheDocument();
});
