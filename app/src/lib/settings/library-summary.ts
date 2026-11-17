import type { ReadFolders } from "#lib/library/library-folders.svelte.ts";
import { m } from "#lib/paraglide/messages.js";

export function librarySummaryOf(
  folders: ReadFolders,
  seriesCount: number,
): string | undefined {
  if (folders.kind !== "loaded" || folders.linked.length === 0) {
    return undefined;
  }
  return m.settings_summary_pair({
    first: m.settings_folder_count({ count: folders.linked.length }),
    second: m.library_series_count({ count: seriesCount }),
  });
}
