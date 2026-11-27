import { tick } from "svelte";
import { expect, onTestFinished, test } from "vitest";
import { render } from "vitest-browser-svelte";

import { DEFAULT_LIBRARY_VIEW, type LibrarySeries } from "#lib/ipc/bindings.ts";

import type { CoverPath } from "./cover-url";
import type { KeepGroup, KeptGroup } from "./library-return";
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

function placedFarBelowTheScreen(): HTMLDivElement {
  const far = document.createElement("div");
  far.style.marginBlockStart = "500vh";
  document.body.append(far);
  onTestFinished(() => {
    far.remove();
  });
  return far;
}

interface Reads {
  count: number;
}

function readSeries(reads: Reads) {
  return () => {
    reads.count += 1;
    return Promise.resolve({
      status: "ok" as const,
      data: { series: [SERIES], next: null },
    });
  };
}

function groupReading(reads: Reads) {
  return {
    name: "Manga",
    listSeries: readSeries(reads),
    countSeries: () => Promise.resolve({ status: "ok" as const, data: 1 }),
    listed: { listing: "all" },
    libraryChanges: 0,
    covers: COVERS,
  };
}

function keptSection(wasNear: boolean): KeptGroup {
  return { series: { items: [SERIES], next: null }, count: 1, wasNear };
}

function keeper(): {
  readonly keeps: (keep: KeepGroup) => () => void;
  readonly kept: () => KeptGroup | undefined;
} {
  let latest: KeepGroup | undefined;
  return {
    keeps: (keep) => {
      latest = keep;
      return () => undefined;
    },
    kept: () => latest?.(),
  };
}

function nextFrame(): Promise<void> {
  return new Promise((drawn) => {
    requestAnimationFrame(() => {
      drawn();
    });
  });
}

test("reads a kept section again at once when it was near the screen as the Library was left", async () => {
  const reads = { count: 0 };

  await render(
    SeriesGroup,
    { ...groupReading(reads), kept: keptSection(true) },
    { baseElement: placedFarBelowTheScreen() },
  );

  await expect.poll(() => reads.count).toBe(1);
});

test("reads a kept section that was far from the screen only once it comes near", async () => {
  const reads = { count: 0 };
  const far = placedFarBelowTheScreen();
  await render(
    SeriesGroup,
    { ...groupReading(reads), kept: keptSection(false) },
    { baseElement: far },
  );
  await nextFrame();
  await nextFrame();
  const readWhileFar = reads.count;

  far.style.marginBlockStart = "0";

  expect(readWhileFar).toBe(0);
  await expect.poll(() => reads.count).toBe(1);
});

test("keeps a section near the screen as near", async () => {
  const near = keeper();

  await render(SeriesGroup, {
    ...groupReading({ count: 0 }),
    keeps: near.keeps,
  });

  await expect.poll(() => near.kept()?.wasNear).toBe(true);
});

test("keeps a section far from the screen as far", async () => {
  const far = keeper();

  await render(
    SeriesGroup,
    { ...groupReading({ count: 0 }), keeps: far.keeps },
    { baseElement: placedFarBelowTheScreen() },
  );
  await expect.poll(() => far.kept()).toBeDefined();
  await nextFrame();
  await nextFrame();

  expect(far.kept()?.wasNear).toBe(false);
});

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
