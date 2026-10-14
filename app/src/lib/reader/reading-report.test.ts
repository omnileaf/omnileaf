import { expect, test, vi } from "vitest";

import type { IpcError } from "#lib/ipc/bindings.ts";

import { type BookId, bookIdIn } from "./opened-book";
import { type ReadingCore, ReadingReport } from "./reading-report";

type CoreAnswer = Awaited<ReturnType<ReadingCore["shown"]>>;

const HEARD: CoreAnswer = { status: "ok", data: null };
const FAILURE: IpcError = {
  code: "internal",
  message: "something went wrong inside the app",
};

type Heard =
  | readonly ["restored", BookId, number]
  | readonly ["shown", BookId, number]
  | readonly ["closed", BookId];

const BOOK = bookIdIn("0190a3e4-0000-8000-8000-0000000000b1");

function bookId(): BookId {
  if (BOOK === undefined) {
    throw new Error("the sample book id has no id's shape");
  }
  return BOOK;
}

function ignoreFailure(): void {
  return;
}

/** A core that hears each report at once, or holds every page shown until the test lets it through, and answers the first page shown as told. */
function listeningCore({
  holdsPagesShown = false,
  answerToFirstPageShown = (): Promise<CoreAnswer> => Promise.resolve(HEARD),
} = {}): {
  core: ReadingCore;
  heard: Heard[];
  letThrough: () => void;
} {
  const heard: Heard[] = [];
  const held: (() => void)[] = [];
  let isFirstPageShown = true;
  return {
    heard,
    letThrough: () => held.shift()?.(),
    core: {
      restored: (book, page) => {
        heard.push(["restored", book, page]);
        return Promise.resolve(HEARD);
      },
      shown: (book, page) => {
        heard.push(["shown", book, page]);
        if (holdsPagesShown) {
          return new Promise((resolve) =>
            held.push(() => {
              resolve(HEARD);
            }),
          );
        }
        if (isFirstPageShown) {
          isFirstPageShown = false;
          return answerToFirstPageShown();
        }
        return Promise.resolve(HEARD);
      },
      closed: (book) => {
        heard.push(["closed", book]);
        return Promise.resolve(HEARD);
      },
    },
  };
}

test("reports the first page shown as the one reading was restored to", async () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core, ignoreFailure);

  report.show(13);

  await expect.poll(() => heard).toEqual([["restored", bookId(), 13]]);
});

test("reports every page shown after the restored one", async () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core, ignoreFailure);

  report.show(13);
  report.show(14);
  report.show(12);

  await expect
    .poll(() => heard.slice(1))
    .toEqual([
      ["shown", bookId(), 14],
      ["shown", bookId(), 12],
    ]);
});

test("reports a page only once the core has heard the one before, so it hears them in order", async () => {
  const { core, heard, letThrough } = listeningCore({ holdsPagesShown: true });
  const report = new ReadingReport(bookId(), core, ignoreFailure);
  report.show(0);
  report.show(1);
  report.show(2);
  await expect.poll(() => heard.length).toBe(2);

  letThrough();

  await expect.poll(() => heard.at(-1)).toEqual(["shown", bookId(), 2]);
  expect(heard).toHaveLength(3);
});

test("reports the book closed once, and nothing shown after it", async () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core, ignoreFailure);
  report.show(0);

  report.close();
  report.close();
  report.show(3);

  await expect
    .poll(() => heard)
    .toEqual([
      ["restored", bookId(), 0],
      ["closed", bookId()],
    ]);
});

test("reports a failure the core answers with, and goes on reporting", async () => {
  const { core, heard } = listeningCore({
    answerToFirstPageShown: () =>
      Promise.resolve({ status: "error", error: FAILURE }),
  });
  const onFailure = vi.fn();
  const report = new ReadingReport(bookId(), core, onFailure);
  report.show(0);
  report.show(1);

  report.show(2);
  report.close();

  await expect.poll(() => heard.at(-1)).toEqual(["closed", bookId()]);
  expect(heard).toHaveLength(4);
  expect(onFailure).toHaveBeenCalledWith(FAILURE);
});

test("reports a report the core rejects, and goes on reporting", async () => {
  const rejected = new Error("the core could not be reached");
  const { core, heard } = listeningCore({
    answerToFirstPageShown: () => Promise.reject(rejected),
  });
  const onFailure = vi.fn();
  const report = new ReadingReport(bookId(), core, onFailure);
  report.show(0);
  report.show(1);

  report.show(2);
  report.close();

  await expect.poll(() => heard.at(-1)).toEqual(["closed", bookId()]);
  expect(heard).toHaveLength(4);
  expect(onFailure).toHaveBeenCalledWith(rejected);
});
