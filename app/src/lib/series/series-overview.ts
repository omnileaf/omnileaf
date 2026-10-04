import type { SeriesOverview } from "#lib/ipc/bindings.ts";

import type { SeriesId } from "./series-id";

/** What the series page's load depends on, invalidated to read the series again. */
export const SERIES_OVERVIEW = "omnileaf:series-overview";

/** The series a page shows, or why it shows none. */
export type SeriesShown =
  | {
      readonly kind: "found";
      readonly id: SeriesId;
      readonly overview: SeriesOverview;
    }
  | { readonly kind: "missing" }
  | { readonly kind: "failed" };
