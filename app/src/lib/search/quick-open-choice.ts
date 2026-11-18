import type { FilterCondition } from "#lib/library/library-listing.ts";
import type {
  HistoryEntry,
  LibrarySeries,
  MissingFolder,
} from "#lib/ipc/bindings.ts";

import type { Place } from "./places";

export type Choice =
  | { readonly kind: "series"; readonly series: LibrarySeries }
  | { readonly kind: "place"; readonly place: Place }
  | { readonly kind: "continue"; readonly entry: HistoryEntry }
  | {
      readonly kind: "search";
      readonly text: string;
      readonly isRecent: boolean;
    }
  | { readonly kind: "showLibrary"; readonly state: FilterCondition }
  | { readonly kind: "findFolder"; readonly missing: MissingFolder };

export function choiceKey(choice: Choice): string {
  switch (choice.kind) {
    case "series":
      return choice.series.id;
    case "place":
      return choice.place.route;
    case "continue":
      return `continue:${choice.entry.book}`;
    case "search":
      return `${choice.isRecent ? "recent" : "search"}:${choice.text}`;
    case "showLibrary":
      return `show-${choice.state}`;
    case "findFolder":
      return `find-${choice.missing.folder.id}`;
  }
}

/** Whether Enter on the choice opens the reader where the reading stopped, rather than a page. */
export function continuesReading(choice: Choice): boolean {
  return (
    choice.kind === "continue" ||
    (choice.kind === "series" && choice.series.continuesFrom !== null)
  );
}
