import { commands, type SeriesDetails } from "#lib/ipc/bindings.ts";

import { type DetailDraft, draftOf } from "./detail-edits.ts";
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
