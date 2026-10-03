import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, expect, test } from "vitest";

import { commands, type LibrarySeries } from "$lib/ipc/bindings";

import { LibrarySeriesList } from "./library-series.svelte";

type WireSeries = Omit<LibrarySeries, "id" | "cover"> & {
  readonly id: string;
  readonly cover: string | null;
};

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

test("lists the series the library holds", async () => {
  mockIPC(() => ({ series: [FIRST, SECOND], next: "cursor" }));
  const series = new LibrarySeriesList(commands.librarySeries);

  await series.load();

  expect(series.list).toEqual({ kind: "loaded", series: [FIRST, SECOND] });
});

test("asks for the first page only", async () => {
  const asked: unknown[] = [];
  mockIPC((_, args) => {
    asked.push(args);
    return { series: [FIRST], next: "cursor" };
  });
  const series = new LibrarySeriesList(commands.librarySeries);

  await series.load();

  expect(asked).toEqual([{ after: null }]);
});

test("keeps the newer list when an older load finishes after it", async () => {
  const answers: ((series: readonly WireSeries[]) => void)[] = [];
  mockIPC(
    () =>
      new Promise((resolve) => {
        answers.push((series) => {
          resolve({ series, next: null });
        });
      }),
  );
  const series = new LibrarySeriesList(commands.librarySeries);
  const older = series.load();
  const newer = series.load();
  await expect.poll(() => answers.length).toBe(2);
  answers[1]?.([FIRST, SECOND]);
  await newer;

  answers[0]?.([FIRST]);
  await older;

  expect(series.list).toEqual({ kind: "loaded", series: [FIRST, SECOND] });
});

test("says when the series can't be listed", async () => {
  mockIPC(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a failed command rejects with its plain error object, which is what the bindings read
    throw { code: "internal", message: "something went wrong inside the app" };
  });
  const series = new LibrarySeriesList(commands.librarySeries);

  await series.load();

  expect(series.list).toEqual({ kind: "failed" });
});
