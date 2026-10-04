import { expect, test } from "vitest";

import { PagedList, type PageResult } from "./paged-list.svelte";

const PAGE_SIZE = 2;

/** Pages through `count` numbers, with each page's start as its cursor, noting every cursor asked for. */
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
