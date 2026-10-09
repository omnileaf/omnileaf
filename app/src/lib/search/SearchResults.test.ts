import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import type { LibrarySeries } from "#lib/ipc/bindings.ts";
import type { CoverPath } from "#lib/library/cover-url.ts";

import SearchResults from "./SearchResults.svelte";

const REAL_TITLE = "Hidden Story";
const STAND_IN = /^Series \d{2,3}$/;

const FOUND = [
  {
    id: "0190a3e4-0000-8000-8000-0000000000a1",
    title: REAL_TITLE,
    bookCount: 3,
    unreadCount: 3,
    cover: "thumb/v1/0190a3e4-0000-8000-8000-0000000000a1/1/1",
  },
] as unknown as readonly LibrarySeries[];

const fakeCoverUrl = (path: CoverPath): string => `omni://localhost/${path}`;

test("shows a stand-in for each title and no cover while Screenshot mode is on", async () => {
  const screen = await render(SearchResults, {
    series: FOUND,
    count: 1,
    isComplete: true,
    onNearEnd: () => undefined,
    coverUrl: fakeCoverUrl,
    usesStandIns: true,
  });

  const found = screen.getByRole("listitem").nth(0);
  await expect.element(found.getByText(STAND_IN)).toBeVisible();
  expect(found.getByText(REAL_TITLE).elements()).toHaveLength(0);
  expect(found.getByRole("presentation").elements()).toHaveLength(0);
});

test("shows each real title and cover while Screenshot mode is off", async () => {
  const screen = await render(SearchResults, {
    series: FOUND,
    count: 1,
    isComplete: true,
    onNearEnd: () => undefined,
    coverUrl: fakeCoverUrl,
    usesStandIns: false,
  });

  const found = screen.getByRole("listitem").nth(0);
  await expect.element(found.getByText(REAL_TITLE)).toBeVisible();
  await expect.element(found.getByRole("presentation")).toBeInTheDocument();
});
