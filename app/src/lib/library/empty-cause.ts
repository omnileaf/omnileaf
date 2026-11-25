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

export interface ListedSeries {
  readonly listedTab: ArrangedTab | undefined;
  readonly isFilterOn: boolean;
}

export interface EmptyList extends ListedSeries {
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

export type EmptyAction = "addFolder" | "goToAll" | "clearFilters";

export function narrowsLibrary({
  listedTab,
  isFilterOn,
}: ListedSeries): boolean {
  if (listedTab === undefined) {
    return isFilterOn;
  }
  switch (listedTab.id.kind) {
    case "all":
      return isFilterOn;
    case "newChapters":
    case "category":
      return true;
    default:
      return assertNever(listedTab.id);
  }
}

export function keepsListChrome(cause: EmptyCause): boolean {
  switch (cause.kind) {
    case "library":
      return false;
    case "tab":
    case "filters":
    case "counting":
      return true;
    default:
      return assertNever(cause);
  }
}

export function actionOffered(
  cause: EmptyCause | undefined,
  offeredBefore: EmptyAction | undefined,
): EmptyAction | undefined {
  if (cause === undefined) {
    return undefined;
  }
  switch (cause.kind) {
    case "library":
      return "addFolder";
    case "tab":
      return "goToAll";
    case "filters":
      return "clearFilters";
    case "counting":
      return offeredBefore;
    default:
      return assertNever(cause);
  }
}
