import { expect, test } from "vitest";

import { type BookId, bookIdIn } from "./opened-book";
import { type ReadingCore, ReadingReport } from "./reading-report";

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

/** A core that hears each report at once, or holds every page shown until the test lets it through. */
function listeningCore({ holdsPagesShown = false } = {}): {
  core: ReadingCore;
  heard: Heard[];
  letThrough: () => void;
} {
  const heard: Heard[] = [];
  const held: (() => void)[] = [];
  return {
    heard,
    letThrough: () => held.shift()?.(),
    core: {
      restored: (book, page) => {
        heard.push(["restored", book, page]);
        return Promise.resolve();
      },
      shown: (book, page) => {
        heard.push(["shown", book, page]);
        return holdsPagesShown
          ? new Promise((resolve) => held.push(resolve))
          : Promise.resolve();
      },
      closed: (book) => {
        heard.push(["closed", book]);
        return Promise.resolve();
      },
    },
  };
}

test("reports the first page shown as the one reading was restored to", async () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core);

  report.show(13);

  await expect.poll(() => heard).toEqual([["restored", bookId(), 13]]);
});

test("reports every page shown after the restored one", async () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core);

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
  const report = new ReadingReport(bookId(), core);
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
  const report = new ReadingReport(bookId(), core);
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
