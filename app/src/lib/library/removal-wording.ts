import type {
  Platform,
  RemovalPreview,
  RemovalTarget,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

const PLATFORMS_WITHOUT_TRASH: readonly Platform[] = ["android", "ios"];

export interface RemovalWording {
  readonly summary: string;
  readonly filesLine: string | undefined;
}

export function removalWording(
  targets: readonly RemovalTarget[],
  preview: RemovalPreview | undefined,
  platform: Platform,
): RemovalWording {
  const count = targets.length;
  const isBooks = targets.every(({ kind }) => kind === "book");
  return {
    summary: isBooks
      ? m.remove_books_summary({ count })
      : m.remove_series_summary({ count }),
    filesLine: preview === undefined ? undefined : filesLine(preview, platform),
  };
}

function filesLine(preview: RemovalPreview, platform: Platform): string {
  const summary = m.remove_files_summary({
    files: preview.files,
    folders: preview.folders,
  });
  return PLATFORMS_WITHOUT_TRASH.includes(platform)
    ? m.remove_files_deleted({ summary })
    : m.remove_files_to_trash({ summary });
}
