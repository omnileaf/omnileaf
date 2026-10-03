import { expect, test } from "vitest";

import {
  type CountSeries,
  LibrarySeriesCount,
} from "./library-series-count.svelte";

type CountResult = Awaited<ReturnType<CountSeries>>;

const FAILED: CountResult = {
  status: "error",
  error: { code: "internal", message: "something went wrong inside the app" },
};

test("holds the number of series once counted", async () => {
  const series = new LibrarySeriesCount(() =>
    Promise.resolve({ status: "ok", data: 24 }),
  );

  await series.load();

  expect(series.count).toBe(24);
});

test("holds no number once counting fails", async () => {
  let answer: CountResult = { status: "ok", data: 24 };
  const series = new LibrarySeriesCount(() => Promise.resolve(answer));
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
  );
  const earlier = series.load();
  const later = series.load();

  answers[1]?.({ status: "ok", data: 25 });
  await later;
  answers[0]?.({ status: "ok", data: 24 });
  await earlier;

  expect(series.count).toBe(25);
});
