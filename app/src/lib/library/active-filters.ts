import type {
  Inclusion,
  LibraryFilter,
  LibraryListing,
  SeriesFormat,
} from "#lib/ipc/bindings.ts";
import { m } from "#lib/paraglide/messages.js";

import type { FilterChip } from "./filter-chips";
import {
  FORMAT_LABELS,
  languageName,
  READ_STATE_LABELS,
  SMART_LABELS,
} from "./filter-labels";
import {
  readStateOf,
  toggledIn,
  withInclusion,
  withReadState,
} from "./library-listing";

export type Removal = (listing: LibraryListing) => LibraryListing;

export interface RemovableChip extends FilterChip {
  readonly remove: Removal;
}

const ADULT_LABELS = {
  only: m.library_chip_adult_only,
  hide: m.library_chip_adult_hidden,
} satisfies Record<Exclude<Inclusion, "any">, () => string>;
const BOOKMARKED_LABELS = {
  only: m.library_chip_bookmarked,
  hide: m.library_chip_not_bookmarked,
} satisfies Record<Exclude<Inclusion, "any">, () => string>;

export function chipsOf(filter: LibraryFilter): RemovableChip[] {
  const readState = readStateOf(filter);
  return [
    ...(readState === "any"
      ? []
      : [
          {
            id: "readState",
            label: READ_STATE_LABELS[readState](),
            remove: (from: LibraryListing) => withReadState(from, "any"),
          },
        ]),
    ...filter.formats.map((format: SeriesFormat) => ({
      id: `format:${format}`,
      label: FORMAT_LABELS[format](),
      remove: (from: LibraryListing) => toggledIn(from, "formats", format),
    })),
    ...filter.languages.map((language) => ({
      id: `language:${language}`,
      label: languageName(language),
      remove: (from: LibraryListing) => toggledIn(from, "languages", language),
    })),
    ...filter.tags.map((tag) => ({
      id: `tag:${tag}`,
      label: tag,
      remove: (from: LibraryListing) => toggledIn(from, "tags", tag),
    })),
    ...filter.smart.map((smart) => ({
      id: `smart:${smart}`,
      label: SMART_LABELS[smart](),
      remove: (from: LibraryListing) => toggledIn(from, "smart", smart),
    })),
    ...(filter.adult === "any"
      ? []
      : [
          {
            id: "adult",
            label: ADULT_LABELS[filter.adult](),
            remove: (from: LibraryListing) =>
              withInclusion(from, "adult", "any"),
          },
        ]),
    ...(filter.bookmarked === "any"
      ? []
      : [
          {
            id: "bookmarked",
            label: BOOKMARKED_LABELS[filter.bookmarked](),
            remove: (from: LibraryListing) =>
              withInclusion(from, "bookmarked", "any"),
          },
        ]),
  ];
}
