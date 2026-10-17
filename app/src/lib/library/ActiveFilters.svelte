<script lang="ts">
  import type { LibraryListing } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { FilterChip } from "./filter-chips";
  import FilterChips from "./FilterChips.svelte";
  import {
    type ReadState,
    readStateOf,
    withoutFilters,
    withReadState,
  } from "./library-listing";

  const READ_STATE = "readState";
  const CHIP_LABELS = {
    any: m.library_read_state_any,
    unread: m.library_read_state_unread,
    inProgress: m.library_read_state_in_progress,
    read: m.library_read_state_read,
  } satisfies Record<ReadState, () => string>;

  let {
    listing,
    onChoose,
    onMore,
  }: {
    listing: LibraryListing;
    onChoose: (listing: LibraryListing) => void;
    onMore: () => void;
  } = $props();

  const chips = $derived.by((): FilterChip[] => {
    const readState = readStateOf(listing.filter);
    return readState === "any"
      ? []
      : [{ id: READ_STATE, label: CHIP_LABELS[readState]() }];
  });

  function remove(id: string): void {
    if (id === READ_STATE) {
      onChoose(withReadState(listing, "any"));
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
