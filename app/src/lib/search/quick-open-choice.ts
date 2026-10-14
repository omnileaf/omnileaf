import type { LibrarySeries } from "#lib/ipc/bindings.ts";

import type { Place } from "./places";

/** Something quick open offers to open. */
export type Choice =
  | { readonly kind: "series"; readonly series: LibrarySeries }
  | { readonly kind: "place"; readonly place: Place };

export function choiceKey(choice: Choice): string {
  switch (choice.kind) {
    case "series":
      return choice.series.id;
    case "place":
      return choice.place.route;
  }
}
