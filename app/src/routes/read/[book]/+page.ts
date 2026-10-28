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
const UNSUPPORTED = "unsupported";

const SHOWN_ON_FAILURE = {
  bookNotFound: MISSING,
  bookUnreadable: UNREADABLE,
  bookTypeUnsupported: UNSUPPORTED,
  fileTypeRead: FAILED,
  folderPickerUnavailable: FAILED,
  folderChooserMissing: FAILED,
  folderUnreadable: FAILED,
  folderNotFound: FAILED,
  folderAlreadyInLibrary: FAILED,
  homeFolderKept: FAILED,
  clipboardUnavailable: FAILED,
  browserUnavailable: FAILED,
  fileManagerUnavailable: FAILED,
  systemSettingsUnavailable: FAILED,
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
  reportsNotSent: FAILED,
  internal: FAILED,
} satisfies Record<IpcErrorCode, BookProblem | typeof UNSUPPORTED>;

async function placeOf(id: BookId) {
  const place = await commands.bookPlace(id);
  return place.status === "ok" ? place.data : null;
}

async function fileOf(id: BookId) {
  const file = await commands.bookFile(id);
  return file.status === "ok" ? file.data : null;
}

async function shownOnFailure(
  id: BookId,
  code: IpcErrorCode,
): Promise<BookShown> {
  const kind = SHOWN_ON_FAILURE[code];
  if (kind === UNSUPPORTED) {
    const [place, file] = await Promise.all([placeOf(id), fileOf(id)]);
    return { kind, place, file };
  }
  return { kind, place: await placeOf(id) };
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
      : await shownOnFailure(id, opened.error.code);
  return { shown };
};
