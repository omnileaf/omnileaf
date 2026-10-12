import { expect, test } from "vitest";

import { PagedList, type PageResult } from "./paged-list.svelte";

const PAGE_SIZE = 2;

function numbers(count: number): {
  readonly asked: (number | null)[];
  readonly list: PagedList<number, number>;
} {
  const asked: (number | null)[] = [];
  const list = new PagedList<number, number>((after) => {
    asked.push(after);
    const start = after ?? 0;
    const end = Math.min(start + PAGE_SIZE, count);
    const page: PageResult<number, number> = {
      status: "ok",
      data: {
        items: Array.from({ length: end - start }, (_, index) => start + index),
        next: end < count ? end : null,
      },
    };
    return Promise.resolve(page);
  });
  return { asked, list };
}

test("reads every page left once all of the list is wanted", async () => {
  const { asked, list } = numbers(5);
  await list.load();

  await list.loadAll();

  expect([asked, list.list]).toEqual([
    [null, 2, 4],
    { kind: "loaded", items: [0, 1, 2, 3, 4], isComplete: true },
  ]);
});

test("reads each page once when all of the list is wanted while a page is on its way", async () => {
  const { asked, list } = numbers(5);
  await list.load();

  await Promise.all([list.loadMore(), list.loadAll()]);

  expect(asked).toEqual([null, 2, 4]);
});

test("stops reading the rest of a list that can't be read", async () => {
  let calls = 0;
  const list = new PagedList<number, number>(() => {
    calls += 1;
    const page: PageResult<number, number> =
      calls === 1
        ? { status: "ok", data: { items: [0], next: 1 } }
        : {
            status: "error",
            error: {
              code: "internal",
              message: "something went wrong inside the app",
            },
          };
    return Promise.resolve(page);
  });
  await list.load();

  await list.loadAll();

  expect([calls, list.list]).toEqual([2, { kind: "failed" }]);
});

function heldPages(): {
  readonly asked: (number | null)[];
  readonly answer: (index: number, next: number | null) => void;
  readonly list: PagedList<number, number>;
} {
  const asked: (number | null)[] = [];
  const answers: ((page: PageResult<number, number>) => void)[] = [];
  const list = new PagedList<number, number>((after) => {
    asked.push(after);
    return new Promise((resolve) => {
      answers.push(resolve);
    });
  });
  const answer = (index: number, next: number | null) => {
    answers[index]?.({
      status: "ok",
      data: { items: [asked[index] ?? 0], next },
    });
  };
  return { asked, answer, list };
}

test("asks for nothing past the list before once a new list has started", async () => {
  const { asked, answer, list } = heldPages();
  const loaded = list.load();
  answer(0, 1);
  await loaded;

  const started = list.start();
  await list.loadMore();
  answer(1, 2);
  await started;

  expect(asked).toEqual([null, null]);
});

test("reads the next page of a new list though the list before was still reading one", async () => {
  const { asked, answer, list } = heldPages();
  const loaded = list.load();
  answer(0, 1);
  await loaded;
  const olderMore = list.loadMore();
  const started = list.start();
  answer(2, 5);
  await started;

  const newerMore = list.loadMore();
  answer(1, null);
  answer(3, null);
  await Promise.all([olderMore, newerMore]);

  expect(asked).toEqual([null, 1, null, 5]);
});
