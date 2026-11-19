import {
  COVERS_PER_ROW,
  DEFAULT_LIBRARY_VIEW,
  type CoversPerRow,
  type LibraryDisplay,
  type LibraryGrouping,
  type LibraryView,
  type OnCovers,
  type Platform,
} from "#lib/ipc/bindings.ts";

export type ScreenSize = keyof CoversPerRow;

export const SCREEN_SIZES: readonly ScreenSize[] = [
  "phone",
  "tablet",
  "desktop",
];

const STACKS_SERIES_COVERS_BY_DEFAULT = {
  android: false,
  ios: true,
  macos: true,
  windows: true,
  linux: true,
} as const satisfies Record<Platform, boolean>;

export function defaultLibraryView(platform: Platform): LibraryView {
  return {
    ...DEFAULT_LIBRARY_VIEW,
    stacksSeriesCovers: STACKS_SERIES_COVERS_BY_DEFAULT[platform],
  };
}

export function viewDrawn(
  view: LibraryView,
  isAndroidPhone: boolean,
): LibraryView {
  if (!isAndroidPhone) {
    return view;
  }
  return {
    ...view,
    display: view.display === "covers" ? "grid" : view.display,
  };
}

export function withDisplay(
  view: LibraryView,
  display: LibraryDisplay,
): LibraryView {
  return { ...view, display };
}

export function withFitsCoversToWidth(
  view: LibraryView,
  fitsCoversToWidth: boolean,
): LibraryView {
  return { ...view, fitsCoversToWidth };
}

export function withCoversPerRow(
  view: LibraryView,
  size: ScreenSize,
  count: number,
): LibraryView {
  const { fewest, most } = COVERS_PER_ROW[size];
  return {
    ...view,
    coversPerRow: {
      ...view.coversPerRow,
      [size]: Math.min(Math.max(count, fewest), most),
    },
  };
}

export function withContinueRow(
  view: LibraryView,
  showsContinueRow: boolean,
): LibraryView {
  return { ...view, showsContinueRow };
}

export function withGroupBy(
  view: LibraryView,
  groupBy: LibraryGrouping,
): LibraryView {
  return { ...view, groupBy };
}

export function withCategoryTabs(
  view: LibraryView,
  showsCategoryTabs: boolean,
): LibraryView {
  return { ...view, showsCategoryTabs };
}

export function withStackedCovers(
  view: LibraryView,
  stacksSeriesCovers: boolean,
): LibraryView {
  return { ...view, stacksSeriesCovers };
}

export function withItemCounts(
  view: LibraryView,
  showsItemCounts: boolean,
): LibraryView {
  return { ...view, showsItemCounts };
}

export function withOnCovers(
  view: LibraryView,
  name: keyof OnCovers,
  isShown: boolean,
): LibraryView {
  return { ...view, onCovers: { ...view.onCovers, [name]: isShown } };
}
