import type { ValueSource } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const SOURCE_WORDING = {
  folderName: () => m.series_detail_from_folder_name(),
  fileName: () => m.series_detail_from_file_names(),
  files: () => m.series_detail_from_files(),
} satisfies Record<ValueSource, () => string>;

export function sourceLine(
  source: ValueSource | null,
  isEdited: boolean,
): string | undefined {
  if (isEdited) {
    return m.series_detail_edited_by_you();
  }
  return source === null ? undefined : SOURCE_WORDING[source]();
}
