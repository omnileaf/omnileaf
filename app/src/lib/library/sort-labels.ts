import type { LibrarySortBy } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export const SORT_LABELS = {
  title: m.library_sort_title,
  dateAdded: m.library_sort_date_added,
  lastRead: m.library_sort_last_read,
  lastUpdated: m.library_sort_last_updated,
  unreadCount: m.library_sort_unread_count,
  timeLeft: m.library_sort_time_left,
} satisfies Record<LibrarySortBy, () => string>;
