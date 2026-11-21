import { expect, test, vi } from "vitest";

import type { IpcError } from "#lib/ipc/bindings.ts";

import {
  type CountSeries,
  LibrarySeriesCount,
} from "./library-series-count.svelte";

type CountResult = Awaited<ReturnType<CountSeries>>;

const FAILURE: IpcError = {
  code: "internal",
  message: "something went wrong inside the app",
};
const FAILED: CountResult = { status: "error", error: FAILURE };

function ignoreFailure(): void {
  return;
}

test("holds the number of series once counted", async () => {
  const series = new LibrarySeriesCount(
    () => Promise.resolve({ status: "ok", data: 24 }),
    ignoreFailure,
  );

  await series.load();

  expect(series.count).toBe(24);
});

test("holds no number once counting fails", async () => {
  let answer: CountResult = { status: "ok", data: 24 };
  const series = new LibrarySeriesCount(
    () => Promise.resolve(answer),
    ignoreFailure,
  );
  await series.load();
  answer = FAILED;

  await series.load();

  expect(series.count).toBeUndefined();
});

test("keeps the count started last when an earlier one answers later", async () => {
  const answers: ((result: CountResult) => void)[] = [];
  const series = new LibrarySeriesCount(
    () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
    ignoreFailure,
  );
  const earlier = series.load();
  const later = series.load();

  answers[1]?.({ status: "ok", data: 25 });
  await later;
  answers[0]?.({ status: "ok", data: 24 });
  await earlier;

  expect(series.count).toBe(25);
});

test("reports why counting failed", async () => {
  const onFailure = vi.fn();
  const series = new LibrarySeriesCount(
    () => Promise.resolve(FAILED),
    onFailure,
  );

  await series.load();

  expect(onFailure).toHaveBeenCalledWith(FAILURE);
});

test("holds no number while the next count is pending", async () => {
  let answer: (result: CountResult) => void = () => undefined;
  let isFirst = true;
  const series = new LibrarySeriesCount(() => {
    if (isFirst) {
      isFirst = false;
      return Promise.resolve({ status: "ok", data: 24 });
    }
    return new Promise((resolve) => {
      answer = resolve;
    });
  }, ignoreFailure);
  await series.load();

  const next = series.load();

  expect(series.count).toBeUndefined();
  answer({ status: "ok", data: 3 });
  await next;
});

test("forgets the number it holds once cleared", async () => {
  const series = new LibrarySeriesCount(
    () => Promise.resolve({ status: "ok", data: 24 }),
    ignoreFailure,
  );
  await series.load();

  series.clear();

  expect(series.count).toBeUndefined();
});

test("drops the answer of a count started before it was cleared", async () => {
  const answers: ((result: CountResult) => void)[] = [];
  const series = new LibrarySeriesCount(
    () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
    ignoreFailure,
  );
  const counting = series.load();
  series.clear();

  answers[0]?.({ status: "ok", data: 24 });
  await counting;

  expect(series.count).toBeUndefined();
});

test("says counting failed until the next count starts", async () => {
  let answer: CountResult = FAILED;
  const series = new LibrarySeriesCount(
    () => Promise.resolve(answer),
    ignoreFailure,
  );
  await series.load();
  const hadFailed = series.hasFailed;
  answer = { status: "ok", data: 24 };

  const next = series.load();

  expect([hadFailed, series.hasFailed]).toEqual([true, false]);
  await next;
});

test("keeps the number it holds while a refresh is pending, then holds the new one", async () => {
  let answer: (result: CountResult) => void = () => undefined;
  let isFirst = true;
  const series = new LibrarySeriesCount(() => {
    if (isFirst) {
      isFirst = false;
      return Promise.resolve({ status: "ok", data: 24 });
    }
    return new Promise((resolve) => {
      answer = resolve;
    });
  }, ignoreFailure);
  await series.load();

  const refreshing = series.refresh();
  const held = series.count;
  answer({ status: "ok", data: 3 });
  await refreshing;

  expect([held, series.count]).toEqual([24, 3]);
});
