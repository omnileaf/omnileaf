import { expect, test } from "vitest";

import type { FolderScan } from "#lib/ipc/bindings.ts";
import type { Notice } from "#lib/notices/notices.ts";

import {
  droppedNotices,
  reportFileFailure,
  unreadableFileNotice,
} from "./drop-notices.ts";

const SCAN: FolderScan = {
  name: "Downloads",
  series: 1,
  books: 12,
  unreadableBooks: 0,
  unsupportedBooks: 0,
  unreadableFolders: 0,
};

const plainName = (scan: FolderScan): string => scan.name;

test("says how many books were added from each folder", () => {
  const notices = droppedNotices(
    { kind: "added", folders: [SCAN, { ...SCAN, name: "More", books: 1 }] },
    plainName,
  );

  expect(notices.map((notice) => notice.title)).toEqual([
    "Added 12 books from Downloads",
    "Added 1 book from More",
  ]);
});

test("says when a folder held no books", () => {
  const notices = droppedNotices(
    { kind: "added", folders: [{ ...SCAN, books: 0 }] },
    plainName,
  );

  expect(notices.map((notice) => notice.title)).toEqual([
    "Found no books in Downloads.",
  ]);
});

test("shows the stand-in name when the folder's own is hidden", () => {
  const notices = droppedNotices(
    { kind: "added", folders: [SCAN] },
    () => "Folder 1",
  );

  expect(notices[0]?.title).toBe("Added 12 books from Folder 1");
});

test("says how many files were copied into the home folder", () => {
  const notices = droppedNotices({ kind: "copied", files: 3 }, plainName);

  expect(notices.map((notice) => notice.title)).toEqual([
    "Copied 3 files into your home folder",
  ]);
});

test("says nothing about files opened for reading", () => {
  const notices = droppedNotices(
    { kind: "reading", book: "book" as never, isInLibrary: false },
    plainName,
  );

  expect(notices).toEqual([]);
});

test("explains a file that could not be read", () => {
  const notice = unreadableFileNotice({
    code: "bookUnreadable",
    message: "damaged",
  });

  expect(notice).toMatchObject({
    tone: "warning",
    title: "This book couldn't be opened",
    body: "Its file may have moved, or be damaged.",
  });
});

test("explains a file of a type this version cannot read", () => {
  const notice = unreadableFileNotice({
    code: "bookTypeUnsupported",
    message: "cbr",
  });

  expect(notice).toMatchObject({
    tone: "warning",
    title: "Omnileaf can't open this file",
    body: "This version can't open files like this one yet. The file stays where it is.",
  });
});

test("leaves any other failure to be reported as it is", () => {
  expect(
    unreadableFileNotice({ code: "internal", message: "broken" }),
  ).toBeUndefined();
  expect(unreadableFileNotice(new Error("broken"))).toBeUndefined();
});

test("shows the explanation for an unreadable file and reports nothing", () => {
  const shown: Notice[] = [];
  const reported: unknown[] = [];

  reportFileFailure(
    { show: (notice) => shown.push(notice) },
    { code: "bookUnreadable", message: "damaged" },
    (error) => reported.push(error),
  );

  expect(shown.map((notice) => notice.title)).toEqual([
    "This book couldn't be opened",
  ]);
  expect(reported).toEqual([]);
});

test("reports a failure it has no explanation for", () => {
  const shown: Notice[] = [];
  const reported: unknown[] = [];
  const failure = new Error("broken");

  reportFileFailure(
    { show: (notice) => shown.push(notice) },
    failure,
    (error) => reported.push(error),
  );

  expect(shown).toEqual([]);
  expect(reported).toEqual([failure]);
});
