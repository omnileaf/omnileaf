import { assertNever } from "#lib/assert-never.ts";

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
  readonly listedTabCount: number | undefined;
}

const EMPTY_LIBRARY: EmptyCause = { kind: "library" };
const FILTERED_OUT: EmptyCause = { kind: "filters" };
const COUNTING: EmptyCause = { kind: "counting" };

function wholeLibraryCause(isFilterOn: boolean): EmptyCause {
  return isFilterOn ? FILTERED_OUT : EMPTY_LIBRARY;
}

function tabCause(tab: EmptyTab, list: EmptyList): EmptyCause {
  if (!list.isFilterOn || list.listedTabCount === 0) {
    return { kind: "tab", tab };
  }
  return list.listedTabCount === undefined ? COUNTING : FILTERED_OUT;
}

export function emptyCause(list: EmptyList): EmptyCause {
  const { listedTab } = list;
  if (list.isLibraryEmpty) {
    return EMPTY_LIBRARY;
  }
  if (listedTab === undefined) {
    return wholeLibraryCause(list.isFilterOn);
  }
  switch (listedTab.id.kind) {
    case "all":
      return wholeLibraryCause(list.isFilterOn);
    case "newChapters":
      return tabCause({ kind: "newChapters" }, list);
    case "category":
      return tabCause({ kind: "category", name: listedTab.name }, list);
    default:
      return assertNever(listedTab.id);
  }
}
