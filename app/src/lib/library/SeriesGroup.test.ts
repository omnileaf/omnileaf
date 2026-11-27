import { tick } from "svelte";
import { expect, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { DEFAULT_LIBRARY_VIEW, type LibrarySeries } from "#lib/ipc/bindings.ts";

import type { CoverPath } from "./cover-url";
import SeriesGroup from "./SeriesGroup.svelte";

type CountResult = { status: "ok"; data: number };

interface Answer {
  readonly answered: Promise<CountResult>;
  readonly answer: (count: number) => Promise<void>;
}

function waitingAnswer(): Answer {
  let resolve: (result: CountResult) => void = () => undefined;
  const answered = new Promise<CountResult>((settle) => {
    resolve = settle;
  });
  return {
    answered,
    answer: async (count) => {
      resolve({ status: "ok", data: count });
      await answered;
      await tick();
    },
  };
}

const SERIES = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: "Sample Series 01",
  bookCount: 1,
  volumeCount: 0,
  chapterCount: 0,
  unreadCount: 1,
  cover: null,
  language: null,
  hasDownloads: false,
  isConnected: true,
  isAdult: false,
  continuesFrom: null,
} as LibrarySeries;

const COVERS = {
  coverUrl: (path: CoverPath) => `omni://localhost/${path}`,
  view: DEFAULT_LIBRARY_VIEW,
  usesStandIns: false,
};

test("keeps the count of the newest listing when an older count answers last", async () => {
  const answers = [waitingAnswer(), waitingAnswer(), waitingAnswer()];
  let asked = 0;
  const props = {
    name: "Manga",
    listSeries: () =>
      Promise.resolve({
        status: "ok" as const,
        data: { series: [SERIES], next: null },
      }),
    countSeries: () => {
      const answer = answers[asked];
      asked += 1;
      return answer?.answered ?? Promise.resolve({ status: "ok", data: 0 });
    },
    listed: { listing: "all" },
    libraryChanges: 0,
    covers: COVERS,
  };
  const screen = await render(SeriesGroup, props);
  await answers[0]?.answer(4);
  await expect.element(screen.getByText("4 series")).toBeVisible();

  await screen.rerender({ ...props, listed: { listing: "unread" } });
  await screen.rerender({ ...props, listed: { listing: "all" } });
  await answers[2]?.answer(4);
  await answers[1]?.answer(1);

  await expect.element(screen.getByText("4 series")).toBeVisible();
  await expect.element(screen.getByText("1 series")).not.toBeInTheDocument();
});
