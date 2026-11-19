import type { IconName } from "#lib/icons/names.ts";
import type { ValueSource } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export interface SourceLine {
  readonly words: string;
  readonly icon: IconName;
}

const SOURCE_LINES = {
  folderName: () => ({
    words: m.series_detail_from_folder_name(),
    icon: "folder",
  }),
  fileName: () => ({
    words: m.series_detail_from_file_names(),
    icon: "file-text",
  }),
  files: () => ({ words: m.series_detail_from_files(), icon: "file-text" }),
} satisfies Record<ValueSource, () => SourceLine>;

export function sourceLine(
  source: ValueSource | null,
  isEdited: boolean,
): SourceLine | undefined {
  if (isEdited) {
    return { words: m.series_detail_edited_by_you(), icon: "pencil" };
  }
  return source === null ? undefined : SOURCE_LINES[source]();
}
