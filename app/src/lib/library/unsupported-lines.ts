import type { SkippedType } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { fileTypeLabel } from "#lib/reader/file-types.ts";

export function unsupportedLines(
  unsupportedBooks: number,
  skippedTypes: readonly SkippedType[] = [],
): string[] {
  if (skippedTypes.length > 0) {
    return skippedTypes.map(({ fileType, files }) =>
      m.library_skipped_type({ count: files, type: fileTypeLabel(fileType) }),
    );
  }
  return unsupportedBooks > 0
    ? [m.library_folder_unsupported_books({ count: unsupportedBooks })]
    : [];
}
