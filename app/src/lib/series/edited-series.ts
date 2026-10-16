import type { ShownCover } from "#lib/library/series-look.ts";

import type { SeriesId } from "./series-id.ts";

export interface EditedSeries {
  readonly id: SeriesId;
  readonly title: string;
  readonly cover: ShownCover;
}
