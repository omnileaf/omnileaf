import type { SeriesFormat } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale } from "#lib/paraglide/runtime.js";

import type { ReadState } from "./library-listing";

export const READ_STATE_LABELS = {
  any: m.library_read_state_any,
  unread: m.library_read_state_unread,
  inProgress: m.library_read_state_in_progress,
  read: m.library_read_state_read,
} satisfies Record<ReadState, () => string>;

export const FORMAT_LABELS = {
  comic: m.library_format_comics,
  manga: m.library_format_manga,
  book: m.library_format_books,
} satisfies Record<SeriesFormat, () => string>;

export function languageName(code: string): string {
  return (
    new Intl.DisplayNames([getLocale()], { type: "language" }).of(code) ?? code
  );
}
