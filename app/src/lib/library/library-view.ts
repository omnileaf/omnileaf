import {
  COVERS_PER_ROW,
  type CoversPerRow,
  type LibraryDisplay,
  type LibraryView,
  type OnCovers,
} from "#lib/ipc/bindings.ts";

export type ScreenSize = keyof CoversPerRow;

export const SCREEN_SIZES: readonly ScreenSize[] = [
  "phone",
  "tablet",
  "desktop",
];

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

export function withCategoryTabs(
  view: LibraryView,
  showsCategoryTabs: boolean,
): LibraryView {
  return { ...view, showsCategoryTabs };
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
