import { expect, test, vi } from "vitest";

import { commands } from "#lib/ipc/bindings.ts";
import type { Notices } from "#lib/notices/notices.ts";
import { bookIdIn } from "#lib/reader/opened-book.ts";

import {
  libraryBookFileShower,
  openedFromLabel,
  showFileLabel,
  showBookFile,
  showFolderLabel,
} from "./show-file";

test("names showing a book's file in each platform's own words", () => {
  const labels = (["ios", "android", "macos", "windows", "linux"] as const).map(
    showFileLabel,
  );

  expect(labels).toEqual([
    "Show in Files",
    "Show the file",
    "Show in Finder",
    "Show in File Explorer",
    "Show in folder",
  ]);
});

test("names showing a series' folder as the series page's menu says it", () => {
  const labels = (["ios", "android", "macos", "windows", "linux"] as const).map(
    showFolderLabel,
  );

  expect(labels).toEqual([
    "Show in Files",
    "Show the folder",
    "Show in Finder",
    "Show in File Explorer",
    "Show in folder",
  ]);
});

test("names where a book opened from, in each platform's own words", () => {
  const labels = (["ios", "android", "macos", "windows", "linux"] as const).map(
    openedFromLabel,
  );

  expect(labels).toEqual([
    "Opened from Files",
    "Opened from your file manager",
    "Opened from Finder",
    "Opened from File Explorer",
    "Opened from your file manager",
  ]);
});

function sampleBook() {
  const id = bookIdIn("0190a3e4-0000-8000-8000-0000000000b6");
  if (id === undefined) {
    throw new Error("the sample id has no id's shape");
  }
  return id;
}

test.each([
  ["no book at all", null],
  [
    "a file opened from outside the library",
    { id: sampleBook(), isInLibrary: false },
  ],
] as const)("offers no way to show %s", (_name, book) => {
  expect(libraryBookFileShower(book, noticeBoard())).toBeUndefined();
});

test("offers a way to show a library book's file", () => {
  expect(
    libraryBookFileShower(
      { id: sampleBook(), isInLibrary: true },
      noticeBoard(),
    ),
  ).toBeTypeOf("function");
});

function noticeBoard() {
  return { show: vi.fn() } satisfies Pick<Notices, "show">;
}

test("tells the reader when the file's folder could not be opened", async () => {
  const notices = noticeBoard();
  vi.spyOn(commands, "showBookInFolder").mockResolvedValue({
    status: "error",
    error: { code: "fileManagerUnavailable", message: "no file manager" },
  });
  const reported = vi.spyOn(window, "reportError").mockReturnValue(undefined);

  showBookFile(sampleBook(), notices);

  await vi.waitFor(() => {
    expect(notices.show).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "warning",
        title: "Couldn't open the folder.",
      }),
    );
  });
  expect(reported).toHaveBeenCalledOnce();
});

test("shows no notice when the file's folder opened", async () => {
  const notices = noticeBoard();
  const shown = vi
    .spyOn(commands, "showBookInFolder")
    .mockResolvedValue({ status: "ok", data: null });

  showBookFile(sampleBook(), notices);

  await vi.waitFor(() => {
    expect(shown).toHaveBeenCalledOnce();
  });
  expect(notices.show).not.toHaveBeenCalled();
});
