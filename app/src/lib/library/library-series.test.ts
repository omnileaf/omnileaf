import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { commands, type LibrarySeries } from "$lib/ipc/bindings";

import { LibrarySeriesList } from "./library-series.svelte";

type WireSeries = Omit<LibrarySeries, "id" | "cover"> & {
  readonly id: string;
  readonly cover: string | null;
};

interface WirePage {
  readonly series: readonly WireSeries[];
  readonly next: string | null;
}

const PAGE_SIZE = 2;

const FIRST: WireSeries = {
  id: "0190a3e4-0000-8000-8000-0000000000a1",
  title: "Sample Series 01",
  bookCount: 3,
  cover: "thumb/v1/0190a3e4-0000-8000-8000-000000000001/1/1",
};
const SECOND: WireSeries = {
  id: "0190a3e4-0000-8000-8000-0000000000a2",
  title: "Sample Series 02",
  bookCount: 1,
  cover: null,
};

afterEach(() => {
  clearMocks();
});

function sampleSeries(count: number): WireSeries[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `0190a3e4-0000-8000-8000-${String(index + 1).padStart(12, "0")}`,
    title: `Sample Series ${String(index + 1).padStart(2, "0")}`,
    bookCount: 1,
    cover: null,
  }));
}

/** Answers each request with the page of `catalog` after its cursor, which is the index the page starts at. */
function pagedFrom(catalog: () => readonly WireSeries[]) {
  const asked: (string | null)[] = [];
  mockIPC((_, args) => {
    const after =
      typeof args === "object" &&
      "after" in args &&
      typeof args.after === "string"
        ? args.after
        : null;
    asked.push(after);
    const start = after === null ? 0 : Number(after);
    const end = start + PAGE_SIZE;
    const page: WirePage = {
      series: catalog().slice(start, end),
      next: end < catalog().length ? String(end) : null,
    };
    return page;
  });
  return asked;
}

/** Holds every request until the test answers it. */
function heldAnswers(): ((page: WirePage) => void)[] {
  const answers: ((page: WirePage) => void)[] = [];
  mockIPC(
    () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
  );
  return answers;
}

function failing(): void {
  mockIPC(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
    throw { code: "internal", message: "something went wrong inside the app" };
  });
}

test("lists the first page of the series the library holds", async () => {
  mockIPC(() => ({ series: [FIRST, SECOND], next: "cursor" }));
  const series = new LibrarySeriesList(commands.librarySeries);

  await series.load();

  expect(series.list).toEqual({
    kind: "loaded",
    series: [FIRST, SECOND],
    isComplete: false,
  });
});

test("asks for the first page only", async () => {
  const asked = pagedFrom(() => sampleSeries(5));
  const series = new LibrarySeriesList(commands.librarySeries);

  await series.load();

  expect(asked).toEqual([null]);
});

test("reads the next page from where the last one ended", async () => {
  const catalog = sampleSeries(5);
  const asked = pagedFrom(() => catalog);
  const series = new LibrarySeriesList(commands.librarySeries);
  await series.load();

  await series.loadMore();

  expect(asked).toEqual([null, "2"]);
  expect(series.list).toEqual({
    kind: "loaded",
    series: catalog.slice(0, 4),
    isComplete: false,
  });
});

test("marks the list complete once its last page is read", async () => {
  const catalog = sampleSeries(3);
  pagedFrom(() => catalog);
  const series = new LibrarySeriesList(commands.librarySeries);
  await series.load();

  await series.loadMore();

  expect(series.list).toEqual({
    kind: "loaded",
    series: catalog,
    isComplete: true,
  });
});

test("asks for nothing more once the list is complete", async () => {
  const asked = pagedFrom(() => sampleSeries(2));
  const series = new LibrarySeriesList(commands.librarySeries);
  await series.load();

  await series.loadMore();

  expect(asked).toEqual([null]);
});

test("asks for one next page at a time", async () => {
  const answers = heldAnswers();
  const series = new LibrarySeriesList(commands.librarySeries);
  const loaded = series.load();
  await expect.poll(() => answers.length).toBe(1);
  answers[0]?.({ series: [FIRST], next: "1" });
  await loaded;

  const once = series.loadMore();
  const twice = series.loadMore();
  await expect.poll(() => answers.length).toBe(2);
  answers[1]?.({ series: [SECOND], next: null });
  await Promise.all([once, twice]);

  expect(answers).toHaveLength(2);
  expect(series.list).toEqual({
    kind: "loaded",
    series: [FIRST, SECOND],
    isComplete: true,
  });
});

test("reads again from the start as many series as it shows", async () => {
  let catalog = sampleSeries(5);
  const asked = pagedFrom(() => catalog);
  const series = new LibrarySeriesList(commands.librarySeries);
  await series.load();
  await series.loadMore();
  catalog = sampleSeries(6).slice(1);
  asked.length = 0;

  await series.load();

  expect(asked).toEqual([null, "2"]);
  expect(series.list).toEqual({
    kind: "loaded",
    series: catalog.slice(0, 4),
    isComplete: false,
  });
});

test("drops a next page that arrives after the list was read again", async () => {
  const answers = heldAnswers();
  const series = new LibrarySeriesList(commands.librarySeries);
  const loaded = series.load();
  await expect.poll(() => answers.length).toBe(1);
  answers[0]?.({ series: [FIRST], next: "1" });
  await loaded;
  const more = series.loadMore();
  const reloaded = series.load();
  await expect.poll(() => answers.length).toBe(3);
  answers[2]?.({ series: [SECOND], next: null });
  await reloaded;

  answers[1]?.({ series: [FIRST], next: null });
  await more;

  expect(series.list).toEqual({
    kind: "loaded",
    series: [SECOND],
    isComplete: true,
  });
});

test("drops a next page asked for while the list was being read again", async () => {
  const answers = heldAnswers();
  const series = new LibrarySeriesList(commands.librarySeries);
  const loaded = series.load();
  await expect.poll(() => answers.length).toBe(1);
  answers[0]?.({ series: [FIRST], next: "1" });
  await loaded;
  const reloaded = series.load();
  const more = series.loadMore();
  await expect.poll(() => answers.length).toBe(3);
  answers[1]?.({ series: [SECOND], next: null });
  await reloaded;

  answers[2]?.({ series: [SECOND], next: null });
  await more;

  expect(series.list).toEqual({
    kind: "loaded",
    series: [SECOND],
    isComplete: true,
  });
});

test("stops reading a list again once a newer read has started", async () => {
  const asked = pagedFrom(() => sampleSeries(5));
  const series = new LibrarySeriesList(commands.librarySeries);
  await series.load();
  await series.loadMore();
  asked.length = 0;

  await Promise.all([series.load(), series.load()]);

  expect(asked).toEqual([null, null, "2"]);
});

test("reads the next page again after asking for one broke", async () => {
  mockIPC(() => ({ series: [FIRST], next: "1" }));
  const series = new LibrarySeriesList(commands.librarySeries);
  await series.load();
  mockIPC(() => {
    throw new Error("the bridge to the core broke");
  });
  await expect(series.loadMore()).rejects.toThrow(
    "the bridge to the core broke",
  );
  mockIPC(() => ({ series: [SECOND], next: null }));

  await series.loadMore();

  expect(series.list).toEqual({
    kind: "loaded",
    series: [FIRST, SECOND],
    isComplete: true,
  });
});

test("keeps the newer list when an older load finishes after it", async () => {
  const answers = heldAnswers();
  const series = new LibrarySeriesList(commands.librarySeries);
  const older = series.load();
  const newer = series.load();
  await expect.poll(() => answers.length).toBe(2);
  answers[1]?.({ series: [FIRST, SECOND], next: null });
  await newer;

  answers[0]?.({ series: [FIRST], next: null });
  await older;

  expect(series.list).toEqual({
    kind: "loaded",
    series: [FIRST, SECOND],
    isComplete: true,
  });
});

test("says when the series can't be listed", async () => {
  failing();
  const series = new LibrarySeriesList(commands.librarySeries);

  await series.load();

  expect(series.list).toEqual({ kind: "failed" });
});

test("says when the next page can't be read", async () => {
  mockIPC(() => ({ series: [FIRST], next: "1" }));
  const series = new LibrarySeriesList(commands.librarySeries);
  await series.load();
  failing();

  await series.loadMore();

  expect(series.list).toEqual({ kind: "failed" });
});
