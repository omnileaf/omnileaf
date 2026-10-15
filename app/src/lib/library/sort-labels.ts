import type { LibrarySortBy } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export const SORT_LABELS = {
  title: m.library_sort_title,
  dateAdded: m.library_sort_date_added,
  lastRead: m.library_sort_last_read,
} satisfies Record<LibrarySortBy, () => string>;
