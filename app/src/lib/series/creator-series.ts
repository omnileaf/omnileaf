import type { CreatorSeries } from "#lib/ipc/bindings.ts";

export const CREATOR_SERIES = "omnileaf:creator-series";

export type CreatorSeriesRead =
  | { readonly kind: "read"; readonly series: readonly CreatorSeries[] }
  | { readonly kind: "failed" };
