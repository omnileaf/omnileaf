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

export type TabCount =
  | { readonly kind: "counting" }
  | { readonly kind: "counted"; readonly count: number }
  | { readonly kind: "failed" };

export interface EmptyList {
  readonly listedTab: ArrangedTab | undefined;
  readonly isFilterOn: boolean;
  readonly isLibraryEmpty: boolean;
  readonly listedTabCount: TabCount;
}

interface CountReading {
  readonly count: number | undefined;
  readonly hasFailed: boolean;
}

const EMPTY_LIBRARY: EmptyCause = { kind: "library" };
const FILTERED_OUT: EmptyCause = { kind: "filters" };
const COUNTING: EmptyCause = { kind: "counting" };

export function tabCountOf({ count, hasFailed }: CountReading): TabCount {
  if (hasFailed) {
    return { kind: "failed" };
  }
  return count === undefined
    ? { kind: "counting" }
    : { kind: "counted", count };
}

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
