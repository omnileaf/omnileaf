import { clearMocks, mockConvertFileSrc } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import type { LibrarySeries } from "#lib/ipc/bindings.ts";

import QuickOpenOption from "./QuickOpenOption.svelte";

const REAL_TITLE = "Hidden Story";
const STAND_IN = /^Series \d{2,3}$/;

const SERIES = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: REAL_TITLE,
  bookCount: 3,
  unreadCount: 3,
  cover: "thumb/v1/0190a3e4-0000-8000-8000-0000000000a1/1/1",
} as unknown as LibrarySeries;

beforeEach(() => {
  mockConvertFileSrc("linux");
});

afterEach(() => {
  clearMocks();
});

function renderSeries(usesStandIns: boolean) {
  return render(QuickOpenOption, {
    id: "option",
    choice: { kind: "series", series: SERIES },
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
