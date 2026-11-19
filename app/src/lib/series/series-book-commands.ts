import { BookmarkX } from "@lucide/svelte";

import {
  commands,
  type ReadMark,
  type RemovalReport,
  type RemovalTarget,
  type SeriesBook,
} from "#lib/ipc/bindings.ts";
import type { Notices } from "#lib/notices/notices.ts";
import { showBookFile } from "#lib/page/show-file.ts";
import type { ListState } from "#lib/paging/paged-list.svelte.ts";
import { m } from "#lib/paraglide/messages.js";

type BookId = SeriesBook["id"];

export interface BookmarkOutcome {
  readonly newlyBookmarked: number;
  readonly failed: boolean;
}

export interface SeriesBookCommands {
  readonly mark: (picked: BookId[], read: ReadMark) => Promise<boolean>;
  readonly bookmark: (picked: BookId[]) => Promise<BookmarkOutcome>;
  readonly removeBookmarks: (picked: BookId[]) => Promise<boolean>;
  readonly remove: (
    targets: RemovalTarget[],
    deleteFiles: boolean,
  ) => Promise<RemovalReport | undefined>;
  readonly showFile: (book: BookId) => void;
}

export function seriesBookCommands({
  listName,
  listed,
  notices,
  readAgain,
}: {
  listName: () => string;
  listed: () => ListState<SeriesBook> | undefined;
  notices: Pick<Notices, "show">;
  readAgain: () => void;
}): SeriesBookCommands {
  function sayBookmarkFailed(): void {
    notices.show({
      tone: "warning",
      icon: BookmarkX,
      title: m.series_bookmark_failed(),
      body: m.series_bookmark_failed_body(),
    });
  }

  async function mark(picked: BookId[], read: ReadMark): Promise<boolean> {
    const marked = await commands.markBooks(picked, read);
    if (marked.status === "error") {
      reportError(marked.error);
      return false;
    }
    readAgain();
    return true;
  }

  async function bookmark(picked: BookId[]): Promise<BookmarkOutcome> {
    const list = listed();
    if (list?.kind !== "loaded") {
      reportError(
        new Error(`read the books of ${listName()} to bookmark them`),
      );
      sayBookmarkFailed();
      return { newlyBookmarked: 0, failed: true };
    }
    const alreadyBookmarked = new Set(
      list.items.filter((book) => book.isBookmarked).map((book) => book.id),
    );
    const toBookmark = picked.filter((id) => !alreadyBookmarked.has(id));
    const results = await Promise.all(
      toBookmark.map((id) => commands.bookmarkPages(id, [0], true)),
    );
    const bookmarked = results.filter((result) => result.status === "ok");
    const failed = bookmarked.length < toBookmark.length;
    for (const result of results) {
      if (result.status === "error") {
        reportError(result.error);
      }
    }
    if (failed) {
      sayBookmarkFailed();
    }
    readAgain();
    return { newlyBookmarked: bookmarked.length, failed };
  }

  async function removeBookmarks(picked: BookId[]): Promise<boolean> {
    const cleared = await commands.clearBookmarks(picked);
    if (cleared.status === "error") {
      reportError(cleared.error);
      sayBookmarkFailed();
    }
    readAgain();
    return cleared.status === "ok";
  }

  async function remove(
    targets: RemovalTarget[],
    deleteFiles: boolean,
  ): Promise<RemovalReport | undefined> {
    const removed = await commands.removeFromLibrary(targets, deleteFiles);
    if (removed.status === "error") {
      reportError(removed.error);
      return undefined;
    }
    readAgain();
    return removed.data;
  }

  return {
    mark,
    bookmark,
    removeBookmarks,
    remove,
    showFile: (book) => {
      showBookFile(book, notices);
    },
  };
}
