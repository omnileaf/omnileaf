import type { LibrarySeries } from "#lib/ipc/bindings.ts";

export interface SeriesMenuActions {
  readonly canLabel: boolean;
  readonly onMarkRead: (series: LibrarySeries) => void;
  readonly onLabel: (series: LibrarySeries) => void;
  readonly canEditDetails: boolean;
  readonly onEditDetails: (series: LibrarySeries) => void;
  readonly onSelect: (series: LibrarySeries) => void;
  readonly onShowInFolder: (series: LibrarySeries) => void;
}
