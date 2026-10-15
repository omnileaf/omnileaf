import type {
  LibraryCategory,
  LibraryTab,
  LibraryTabId,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import { ALL_SERIES } from "./library-tab.svelte.ts";

export const NEW_CHAPTERS = "new-chapters";

const FEWEST_TABS_BESIDE_ALL = 2;

export const NEW_LIBRARY_TABS: readonly LibraryTab[] = [
  { id: { kind: "all" }, isHidden: false },
  { id: { kind: "newChapters" }, isHidden: true },
];

export interface ArrangedTab {
  readonly id: LibraryTabId;
  readonly name: string;
  readonly isHidden: boolean;
}

export function tabKey(id: LibraryTabId): string {
  switch (id.kind) {
    case "all":
      return ALL_SERIES;
    case "newChapters":
      return NEW_CHAPTERS;
    case "category":
      return id.id;
  }
}

function nameOf(
  id: LibraryTabId,
  names: ReadonlyMap<string, string>,
): string | undefined {
  switch (id.kind) {
    case "all":
      return m.library_category_all();
    case "newChapters":
      return m.library_tab_new_chapters();
    case "category":
      return names.get(id.id);
  }
}

export function showsTabs(shown: readonly ArrangedTab[]): boolean {
  return (
    shown.filter(({ id }) => id.kind !== "all").length >= FEWEST_TABS_BESIDE_ALL
  );
}

/** The tabs in the order kept, without those whose category has gone, then each category not placed yet. */
export function arrangedTabs(
  tabs: readonly LibraryTab[],
  categories: readonly LibraryCategory[],
): readonly ArrangedTab[] {
  const names = new Map(categories.map(({ id, name }) => [id, name]));
  const placed = tabs.flatMap(({ id, isHidden }) => {
    const name = nameOf(id, names);
    return name === undefined ? [] : [{ id, name, isHidden }];
  });
  const placedCategories = new Set(
    tabs.flatMap(({ id }) => (id.kind === "category" ? [id.id] : [])),
  );
  const unplaced = categories
    .filter(({ id }) => !placedCategories.has(id))
    .map(({ id, name }) => ({
      id: { kind: "category" as const, id },
      name,
      isHidden: false,
    }));
  return [...placed, ...unplaced];
}
