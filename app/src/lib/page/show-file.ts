import { CircleAlert } from "@lucide/svelte";

import { type BookPlace, commands, type Platform } from "#lib/ipc/bindings.ts";
import type { Notices } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

const SHOW_FILE = {
  ios: m.show_in_files,
  android: m.reader_show_file,
  macos: m.show_in_finder,
  windows: m.show_in_file_explorer,
  linux: m.reader_show_in_folder,
} satisfies Record<Platform, () => string>;

const SHOW_FOLDER = {
  ios: m.show_in_files,
  android: m.series_show_the_folder,
  macos: m.show_in_finder,
  windows: m.show_in_file_explorer,
  linux: m.series_show_in_folder,
} satisfies Record<Platform, () => string>;

const OPENED_FROM = {
  ios: m.reader_opened_from_files,
  android: m.reader_opened_from_file_manager,
  macos: m.reader_opened_from_finder,
  windows: m.reader_opened_from_file_explorer,
  linux: m.reader_opened_from_file_manager,
} satisfies Record<Platform, () => string>;

export function showFileLabel(platform: Platform): string {
  return SHOW_FILE[platform]();
}

export function showFolderLabel(platform: Platform): string {
  return SHOW_FOLDER[platform]();
}

export function openedFromLabel(platform: Platform): string {
  return OPENED_FROM[platform]();
}

export function showBookFile(
  book: BookPlace["id"],
  notices: Pick<Notices, "show">,
): void {
  void commands.showBookInFolder(book).then((shown) => {
    if (shown.status === "error") {
      reportError(shown.error);
      notices.show({
        tone: "warning",
        icon: CircleAlert,
        title: m.show_file_failed(),
      });
    }
  });
}

export function libraryBookFileShower(
  book: Pick<BookPlace, "id" | "isInLibrary"> | null,
  notices: Pick<Notices, "show">,
): (() => void) | undefined {
  if (book === null || !book.isInLibrary) {
    return undefined;
  }
  return () => {
    showBookFile(book.id, notices);
  };
}
