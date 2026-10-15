<script lang="ts">
  import type { LibraryListing } from "#lib/ipc/bindings.ts";

  import { chipsOf } from "./active-filters";
  import FilterChips from "./FilterChips.svelte";
  import { withoutFilters } from "./library-listing";

  let {
    listing,
    onChoose,
    onMore,
  }: {
    listing: LibraryListing;
    onChoose: (listing: LibraryListing) => void;
    onMore: () => void;
  } = $props();

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
