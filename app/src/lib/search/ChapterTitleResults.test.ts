import { afterEach, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import "../../app.css";

import type { ChapterHit, Platform } from "#lib/ipc/bindings.ts";
import { followCorePlatform } from "#lib/page/platform.ts";

import ChapterTitleResults from "./ChapterTitleResults.svelte";

const AWAY: ChapterHit = {
  series: "0190a3e4-0000-8000-8000-0000000000b2" as ChapterHit["series"],
  seriesTitle: "Sample Series 02",
  book: "0190a3e4-0000-8001-8000-0000000000b2" as ChapterHit["book"],
  position: 4,
  title: "Salt and Harbour Lights",
  matchedIn: "fileName",
  file: { kind: "notConnected" },
};

const THERE: ChapterHit = {
  ...AWAY,
  series: "0190a3e4-0000-8000-8000-0000000000b4" as ChapterHit["series"],
  seriesTitle: "Sample Series 04",
  book: "0190a3e4-0000-8001-8000-0000000000b4" as ChapterHit["book"],
  title: "The Harbour Gate at Night",
  file: { kind: "present" },
};

afterEach(() => {
  delete document.documentElement.dataset.platform;
});

async function renderHits(
  platform: Platform,
  handlers: {
    onNotConnected?: (hit: ChapterHit) => void;
    onFind?: (hit: ChapterHit) => void;
  } = {},
) {
  await page.viewport(390, 800);
  followCorePlatform(platform);
  return render(ChapterTitleResults, {
    hits: [THERE, AWAY],
    isComplete: true,
    onShowAll: () => undefined,
    onNotConnected: handlers.onNotConnected ?? (() => undefined),
    onFind: handlers.onFind ?? (() => undefined),
  });
}

test("keeps a chapter that isn't connected from opening and tags it on an Android phone", async () => {
  const touched: string[] = [];
  const screen = await renderHits("android", {
    onNotConnected: ({ title }) => touched.push(title),
  });

  const away = screen.getByRole("button", { name: /Salt and Harbour Lights/ });
  await away.click();

  await expect.element(away.getByText("Not connected")).toBeVisible();
  expect({
    links: screen.getByRole("link").elements().length,
    touched,
  }).toEqual({ links: 1, touched: ["Salt and Harbour Lights"] });
});

test("finds the folder of a chapter that isn't connected from its own button, named for its series", async () => {
  const found: string[] = [];
  const screen = await renderHits("android", {
    onFind: ({ title }) => found.push(title),
  });

  await screen
    .getByRole("button", { name: "Find the folder for Sample Series 02" })
    .click();

  expect(found).toEqual(["Salt and Harbour Lights"]);
});

test("keeps opening a chapter that isn't connected off an Android phone", async () => {
  const screen = await renderHits("macos");

  expect({
    links: screen.getByRole("link").elements().length,
    tags: screen.getByText("Not connected").elements().length,
  }).toEqual({ links: 2, tags: 0 });
});
