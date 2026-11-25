import { assertNever } from "#lib/assert-never.ts";

import type { TabCount } from "./library-series-count.svelte.ts";
import type { ArrangedTab } from "./library-tabs.ts";

export type EmptyTab =
  | { readonly kind: "category"; readonly name: string }
  | { readonly kind: "newChapters" };

export type EmptyCause =
  | { readonly kind: "library" }
  | { readonly kind: "tab"; readonly tab: EmptyTab }
  | { readonly kind: "filters" }
  | { readonly kind: "counting" };

export interface EmptyList {
  readonly listedTab: ArrangedTab | undefined;
  readonly isFilterOn: boolean;
  readonly isLibraryEmpty: boolean;
  readonly listedTabCount: TabCount;
}

const EMPTY_LIBRARY: EmptyCause = { kind: "library" };
const FILTERED_OUT: EmptyCause = { kind: "filters" };
const COUNTING: EmptyCause = { kind: "counting" };

function wholeLibraryCauseOf(list: EmptyList): EmptyCause {
  return list.isFilterOn ? FILTERED_OUT : EMPTY_LIBRARY;
}

function tabCauseOf(tab: EmptyTab, list: EmptyList): EmptyCause {
  if (!list.isFilterOn) {
    return { kind: "tab", tab };
  }
  const counted = list.listedTabCount;
  switch (counted.kind) {
    case "counting":
      return COUNTING;
    case "counted":
      return counted.count === 0 ? { kind: "tab", tab } : FILTERED_OUT;
    case "failed":
      return FILTERED_OUT;
    default:
      return assertNever(counted);
  }
}

export function emptyCauseOf(list: EmptyList): EmptyCause {
  const { listedTab } = list;
  if (list.isLibraryEmpty) {
    return EMPTY_LIBRARY;
  }
  if (listedTab === undefined) {
    return wholeLibraryCauseOf(list);
  }
  switch (listedTab.id.kind) {
    case "all":
      return wholeLibraryCauseOf(list);
    case "newChapters":
      return tabCauseOf({ kind: "newChapters" }, list);
    case "category":
      return tabCauseOf({ kind: "category", name: listedTab.name }, list);
    default:
      return assertNever(listedTab.id);
  }
}
