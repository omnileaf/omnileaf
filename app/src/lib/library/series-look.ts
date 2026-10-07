import type { LibrarySeries } from "$lib/ipc/bindings";
import { standInName, standInNumberFor } from "$lib/screenshot-mode/stand-ins";

import type { CoverPath } from "./cover-url";

export type ShownCover =
  | { readonly kind: "picture"; readonly path: CoverPath }
  | { readonly kind: "none" }
  | { readonly kind: "standIn" };

export interface SeriesLook {
  readonly title: string;
  readonly cover: ShownCover;
}

export type LookOf = (series: LibrarySeries) => SeriesLook;

export const realLook: LookOf = (series) => ({
  title: series.title,
  cover:
    series.cover === null
      ? { kind: "none" }
      : { kind: "picture", path: series.cover },
});

/** Leaves the cover's path behind, so no picture of it is ever asked for. */
export const standInLook: LookOf = (series) => ({
  title: standInName("series", standInNumberFor(series.id)),
  cover: { kind: "standIn" },
});
