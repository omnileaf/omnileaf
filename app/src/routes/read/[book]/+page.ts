import { commands, type IpcErrorCode } from "#lib/ipc/bindings.ts";
import { webviewUndecodableFormats } from "#lib/reader/format-probe.ts";
import { bookIdIn, type BookShown } from "#lib/reader/opened-book.ts";

import type { PageLoad } from "./$types";

const MISSING: BookShown = { kind: "missing" };
const UNREADABLE: BookShown = { kind: "unreadable" };
const FAILED: BookShown = { kind: "failed" };

const SHOWN_ON_FAILURE = {
  bookNotFound: MISSING,
  bookUnreadable: UNREADABLE,
  folderPickerUnavailable: FAILED,
  folderChooserMissing: FAILED,
  folderUnreadable: FAILED,
  folderNotFound: FAILED,
  homeFolderKept: FAILED,
  clipboardUnavailable: FAILED,
  browserUnavailable: FAILED,
  noCrashReport: FAILED,
  crashReportUnavailable: FAILED,
  developmentBuildOnly: FAILED,
  seriesNotFound: FAILED,
  searchTooLong: FAILED,
  cursorForAnotherList: FAILED,
  internal: FAILED,
} satisfies Record<IpcErrorCode, BookShown>;

/** Opens the book before the reader shows, once the webview has said which page formats it can't decode. */
export const load: PageLoad = async ({ params }) => {
  const id = bookIdIn(params.book);
  if (id === undefined) {
    return { shown: MISSING };
  }
  const opened = await commands.openBook(id, await webviewUndecodableFormats());
  const shown: BookShown =
    opened.status === "ok"
      ? { kind: "found", book: opened.data }
      : SHOWN_ON_FAILURE[opened.error.code];
  return { shown };
};
