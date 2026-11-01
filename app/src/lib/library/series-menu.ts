import type { LibrarySeries } from "#lib/ipc/bindings.ts";

export const MENU_ICON_SIZE = 16;

export interface PickedSeriesActions {
  readonly onMarkRead: () => void;
  readonly onLabel: () => void;
  readonly onShowInFolder: () => void;
  readonly onRemove: () => void;
}

export interface SeriesMenuActions {
  readonly canLabel: boolean;
  readonly onMarkRead: (series: LibrarySeries) => void;
  readonly onLabel: (series: LibrarySeries) => void;
  readonly canEditDetails: boolean;
  readonly onEditDetails: (series: LibrarySeries) => void;
  readonly onSelect: (series: LibrarySeries) => void;
  readonly onShowInFolder: (series: LibrarySeries) => void;
  readonly onRemove?: ((series: LibrarySeries) => void) | undefined;
  readonly picked?: PickedSeriesActions | undefined;
}
