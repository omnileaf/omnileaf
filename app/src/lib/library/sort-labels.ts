import type { LibrarySort, LibrarySortBy } from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

export const SORT_LABELS = {
  title: m.library_sort_title,
  dateAdded: m.library_sort_date_added,
  lastRead: m.library_sort_last_read,
  lastUpdated: m.library_sort_last_updated,
  unreadCount: m.library_sort_unread_count,
  timeLeft: m.library_sort_time_left,
} satisfies Record<LibrarySortBy, () => string>;

export interface Wording {
  readonly label: () => string;
  readonly change: () => string;
}

const BY_TIME = [
  {
    label: m.library_sort_oldest_first,
    change: m.library_sort_oldest_first_change,
  },
  {
    label: m.library_sort_newest_first,
    change: m.library_sort_newest_first_change,
  },
] as const satisfies readonly [Wording, Wording];

const DIRECTION_WORDING = {
  title: [
    { label: m.library_sort_a_to_z, change: m.library_sort_a_to_z_change },
    { label: m.library_sort_z_to_a, change: m.library_sort_z_to_a_change },
  ],
  dateAdded: BY_TIME,
  lastRead: BY_TIME,
  lastUpdated: BY_TIME,
  unreadCount: [
    {
      label: m.library_sort_fewest_unread_first,
      change: m.library_sort_fewest_unread_first_change,
    },
    {
      label: m.library_sort_most_unread_first,
      change: m.library_sort_most_unread_first_change,
    },
  ],
  timeLeft: [
    {
      label: m.library_sort_shortest_first,
      change: m.library_sort_shortest_first_change,
    },
    {
      label: m.library_sort_longest_first,
      change: m.library_sort_longest_first_change,
    },
  ],
} satisfies Record<LibrarySortBy, readonly [Wording, Wording]>;

export function directionWording({ by, direction }: LibrarySort): Wording {
  const [ascending, descending] = DIRECTION_WORDING[by];
  return direction === "ascending" ? ascending : descending;
}

export function directionWordings(
  by: LibrarySortBy,
): readonly [Wording, Wording] {
  return DIRECTION_WORDING[by];
}
