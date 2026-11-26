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

test("shows the pages kept from before at once and reads on from where they end", async () => {
  const asked: (number | null)[] = [];
  const list = new PagedList<number, number>(
    (after) => {
      asked.push(after);
      return Promise.resolve({
        status: "ok",
        data: { items: [after ?? 0], next: null },
      });
    },
    { items: [0, 1], next: 2 },
  );
  const shownAtOnce = list.list;

  await list.loadMore();

  expect([shownAtOnce, asked, list.list]).toEqual([
    { kind: "loaded", items: [0, 1], isComplete: false },
    [2],
    { kind: "loaded", items: [0, 1, 2], isComplete: true },
  ]);
});

test("keeps the pages from the start through the one holding the last item shown", async () => {
  const { list } = numbers(7);
  await list.load();
  await list.loadMore();
  await list.loadMore();

  const kept = [1, 3, 4, 5].map((shown) => list.pagesThroughShown(shown));

  expect(kept).toEqual([
    { items: [0, 1], next: 2 },
    { items: [0, 1, 2, 3], next: 4 },
    { items: [0, 1, 2, 3], next: 4 },
    { items: [0, 1, 2, 3, 4, 5], next: 6 },
  ]);
});

test("keeps the first page of a list that shows none of its items", async () => {
  const { list } = numbers(5);
  await list.load();
  await list.loadMore();

  expect(list.pagesThroughShown(0)).toEqual({ items: [0, 1], next: 2 });
});

test("keeps a whole list that ends on the page shown", async () => {
  const { list } = numbers(3);
  await list.load();
  await list.loadMore();

  expect(list.pagesThroughShown(3)).toEqual({ items: [0, 1, 2], next: null });
});

test("keeps the pages of a list read again from its start as the pages they were read in", async () => {
  const { list } = numbers(7);
  await list.load();
  await list.loadMore();
  await list.loadMore();

  await list.load();

  expect(list.pagesThroughShown(3)).toEqual({ items: [0, 1, 2, 3], next: 4 });
});

test("keeps the pages read on from a kept list", async () => {
  const { list } = numbers(7);
  await list.load();
  const returned = new PagedList((after: number | null) => {
    const start = after ?? 0;
    return Promise.resolve({
      status: "ok" as const,
      data: { items: [start, start + 1], next: start + 2 },
    });
  }, list.pagesThroughShown(2));

  await returned.loadMore();

  expect(returned.pagesThroughShown(3)).toEqual({
    items: [0, 1, 2, 3],
    next: 4,
  });
});

test("keeps nothing of a list not read yet", () => {
  const { list } = numbers(3);

  expect(list.pagesThroughShown(1)).toBeUndefined();
});
