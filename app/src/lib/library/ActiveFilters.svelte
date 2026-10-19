<script lang="ts">
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
  } from "./filter-labels";
  import FilterChips from "./FilterChips.svelte";
  import {
    readStateOf,
    toggledIn,
    withInclusion,
    withoutFilters,
    withReadState,
  } from "./library-listing";

  type Removal = (listing: LibraryListing) => LibraryListing;

  interface RemovableChip extends FilterChip {
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

  let {
    listing,
    onChoose,
    onMore,
  }: {
    listing: LibraryListing;
    onChoose: (listing: LibraryListing) => void;
    onMore: () => void;
  } = $props();

  function chipsOf(filter: LibraryFilter): RemovableChip[] {
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
        remove: (from: LibraryListing) =>
          toggledIn(from, "languages", language),
      })),
      ...filter.tags.map((tag) => ({
        id: `tag:${tag}`,
        label: tag,
        remove: (from: LibraryListing) => toggledIn(from, "tags", tag),
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

  const chips = $derived(chipsOf(listing.filter));

  function remove(id: string): void {
    const chip = chips.find((candidate) => candidate.id === id);
    if (chip !== undefined) {
      onChoose(chip.remove(listing));
    }
  }
</script>

<FilterChips
  {chips}
  onRemove={remove}
  {onMore}
  onClearAll={() => {
    onChoose(withoutFilters(listing));
  }}
/>
