import {
  commands,
  type DetailEdits,
  type SeriesDetails,
} from "#lib/ipc/bindings.ts";
import type { Notices } from "#lib/notices/notices.ts";
import { m } from "#lib/paraglide/messages.js";

import { type DetailDraft, draftOf, editsOf } from "./detail-edits.ts";
import type { SeriesId } from "./series-id.ts";

export interface DetailsBeingEdited {
  readonly details: SeriesDetails;
  readonly opened: DetailDraft;
  draft: DetailDraft;
}

export type DetailsRead =
  | { readonly kind: "read"; readonly editing: DetailsBeingEdited }
  | { readonly kind: "failed"; readonly error: unknown };

export async function detailsToEdit(id: SeriesId): Promise<DetailsRead> {
  const read = await commands.seriesDetails(id);
  if (read.status !== "ok") {
    return { kind: "failed", error: read.error };
  }
  const opened = draftOf(read.data);
  return {
    kind: "read",
    editing: { details: read.data, opened, draft: opened },
  };
}

export function editsBefore(details: SeriesDetails): DetailEdits {
  return {
    title: details.title.edited,
    people: details.people.edited,
    tags: details.tags.edited,
    summary: details.summary.edited,
    isMarkedAdult: details.isMarkedAdult,
  };
}

export async function saveDetails(
  id: SeriesId,
  editing: DetailsBeingEdited,
  notices: Notices,
): Promise<boolean> {
  const saved = await commands.editSeriesDetails(
    id,
    editsOf(editing.details, editing.draft),
  );
  if (saved.status !== "ok") {
    reportError(saved.error);
    return false;
  }
  const before = editsBefore(editing.details);
  notices.offerUndo({
    title: m.edit_details_saved(),
    body: m.edit_details_saved_note(),
    undo: () => {
      void commands.editSeriesDetails(id, before).then((undone) => {
        if (undone.status !== "ok") {
          reportError(undone.error);
        }
      });
    },
  });
  return true;
}
