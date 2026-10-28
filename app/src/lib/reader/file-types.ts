import type { FileType } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const ARCHIVE_TYPES_OPENED: readonly FileType[] = ["cbz", "cb7"];

export function fileTypeLabel(fileType: FileType): string {
  return fileType.toUpperCase();
}

export function fileKindsOpened(): string[] {
  return [...ARCHIVE_TYPES_OPENED.map(fileTypeLabel), m.reader_opens_folders()];
}
