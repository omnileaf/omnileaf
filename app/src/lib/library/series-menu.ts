import type { LibrarySeries } from "#lib/ipc/bindings.ts";

export interface SeriesMenuActions {
  readonly canLabel: boolean;
  readonly onMarkRead: (series: LibrarySeries) => void;
  readonly onLabel: (series: LibrarySeries) => void;
  readonly onSelect: (series: LibrarySeries) => void;
}
