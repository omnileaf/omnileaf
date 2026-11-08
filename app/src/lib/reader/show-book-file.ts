import { commands } from "#lib/ipc/bindings.ts";

import type { BookId } from "./opened-book.ts";

interface BookInPlace {
  readonly id: BookId;
  readonly isInLibrary: boolean;
}

export function showBookFile(book: BookId): void {
  void commands.showBookInFolder(book).then((shown) => {
    if (shown.status === "error") {
      reportError(shown.error);
    }
  });
}

/** None for a file opened from outside the library, which has no library folder to show. */
export function showFileAction(
  book: BookInPlace | null,
): (() => void) | undefined {
  if (book === null || !book.isInLibrary) {
    return undefined;
  }
  return () => {
    showBookFile(book.id);
  };
}
