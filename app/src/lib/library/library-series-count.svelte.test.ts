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
