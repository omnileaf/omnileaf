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

function listeningCore(): { core: ReadingCore; heard: Heard[] } {
  const heard: Heard[] = [];
  return {
    heard,
    core: {
      restored: (book, page) => heard.push(["restored", book, page]),
      shown: (book, page) => heard.push(["shown", book, page]),
      closed: (book) => heard.push(["closed", book]),
    },
  };
}

test("reports the first page shown as the one reading was restored to", () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core);

  report.show(13);

  expect(heard).toEqual([["restored", bookId(), 13]]);
});

test("reports every page shown after the restored one", () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core);

  report.show(13);
  report.show(14);
  report.show(12);

  expect(heard.slice(1)).toEqual([
    ["shown", bookId(), 14],
    ["shown", bookId(), 12],
  ]);
});

test("reports the book closed once, and nothing shown after it", () => {
  const { core, heard } = listeningCore();
  const report = new ReadingReport(bookId(), core);
  report.show(0);

  report.close();
  report.close();
  report.show(3);

  expect(heard).toEqual([
    ["restored", bookId(), 0],
    ["closed", bookId()],
  ]);
});
