import type { LibrarySortBy } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export const SORT_LABELS = {
  title: m.library_sort_title,
  dateAdded: m.library_sort_date_added,
} satisfies Record<LibrarySortBy, () => string>;
