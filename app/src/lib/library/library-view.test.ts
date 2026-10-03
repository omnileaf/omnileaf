import { expect, test } from "vitest";

import { DEFAULT_LIBRARY_VIEW, type LibraryView } from "$lib/ipc/bindings";

import {
  withCoversPerRow,
  withDisplay,
  withItemCounts,
  withOnCovers,
} from "./library-view";

const VIEW: LibraryView = {
  display: "grid",
  coversPerRow: { phone: 3, tablet: 5, desktop: 6 },
  showsItemCounts: false,
  onCovers: DEFAULT_LIBRARY_VIEW.onCovers,
};

test("changes the covers per row of one size and leaves the others", () => {
  const view = withCoversPerRow(VIEW, "tablet", 7);

  expect(view.coversPerRow).toEqual({ phone: 3, tablet: 7, desktop: 6 });
});

test("holds the covers per row of each size to the range it offers", () => {
  const fewest = [
    withCoversPerRow(VIEW, "phone", 1).coversPerRow.phone,
    withCoversPerRow(VIEW, "tablet", 2).coversPerRow.tablet,
    withCoversPerRow(VIEW, "desktop", 3).coversPerRow.desktop,
  ];
  const most = [
    withCoversPerRow(VIEW, "phone", 6).coversPerRow.phone,
    withCoversPerRow(VIEW, "tablet", 9).coversPerRow.tablet,
    withCoversPerRow(VIEW, "desktop", 13).coversPerRow.desktop,
  ];

  expect(fewest).toEqual([2, 3, 4]);
  expect(most).toEqual([5, 8, 12]);
});

test("changes how the library is drawn and keeps the covers per row", () => {
  const view = withDisplay(VIEW, "list");

  expect(view).toEqual({ ...VIEW, display: "list" });
});

test("turns the item counts on and off", () => {
  const shown = withItemCounts(DEFAULT_LIBRARY_VIEW, true);

  expect(shown.showsItemCounts).toBe(true);
  expect(withItemCounts(shown, false)).toEqual(DEFAULT_LIBRARY_VIEW);
});

test("turns one thing covers show on or off and keeps the rest", () => {
  const view = withOnCovers(VIEW, "showsLanguage", true);

  expect(view).toEqual({
    ...VIEW,
    onCovers: { ...VIEW.onCovers, showsLanguage: true },
  });
});
