import { commands, type IpcErrorCode } from "#lib/ipc/bindings.ts";
import { webviewUndecodableFormats } from "#lib/reader/format-probe.ts";
import {
  type BookId,
  bookIdIn,
  type BookProblem,
  type BookShown,
} from "#lib/reader/opened-book.ts";

import type { PageLoad } from "./$types";

const MISSING: BookProblem = "missing";
const UNREADABLE: BookProblem = "unreadable";
const FAILED: BookProblem = "failed";

const SHOWN_ON_FAILURE = {
  bookNotFound: MISSING,
  bookUnreadable: UNREADABLE,
  folderPickerUnavailable: FAILED,
  folderChooserMissing: FAILED,
  folderUnreadable: FAILED,
  folderNotFound: FAILED,
  folderAlreadyInLibrary: FAILED,
  homeFolderKept: FAILED,
  clipboardUnavailable: FAILED,
  browserUnavailable: FAILED,
  fileManagerUnavailable: FAILED,
  noCrashReport: FAILED,
  crashReportUnavailable: FAILED,
  developmentBuildOnly: FAILED,
  seriesNotFound: FAILED,
  searchTooLong: FAILED,
  cursorForAnotherList: FAILED,
  bookmarksNotKept: FAILED,
  labelsNotKept: FAILED,
  detailsNotKept: FAILED,
  reportNotSaved: FAILED,
  internal: FAILED,
} satisfies Record<IpcErrorCode, BookProblem>;

async function placeOf(id: BookId) {
  const place = await commands.bookPlace(id);
  return place.status === "ok" ? place.data : null;
}

/** Opens the book before the reader shows, once the webview has said which page formats it can't decode. */
export const load: PageLoad = async ({ params }) => {
  const id = bookIdIn(params.book);
  if (id === undefined) {
    return { shown: { kind: MISSING, place: null } satisfies BookShown };
  }
  const opened = await commands.openBook(id, await webviewUndecodableFormats());
  const shown: BookShown =
    opened.status === "ok"
      ? { kind: "found", book: opened.data }
      : { kind: SHOWN_ON_FAILURE[opened.error.code], place: await placeOf(id) };
  return { shown };
};
