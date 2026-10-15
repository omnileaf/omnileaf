<script lang="ts">
  import type { LibraryListing, LibrarySortBy } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    type ReadState,
    reversed,
    sortedBy,
    withReadState,
  } from "./library-listing";
  import ReadStateChoice from "./ReadStateChoice.svelte";
  import SortSelect from "./SortSelect.svelte";

  let {
    listing,
    onChoose,
  }: {
    listing: LibraryListing;
    onChoose: (listing: LibraryListing) => void;
  } = $props();
</script>

<section class="flex flex-col">
  <h3 class="text-small font-semibold">{m.library_sort()}</h3>
  <SortSelect
    sort={listing.sort}
    onSortBy={(by: LibrarySortBy) => {
      onChoose(sortedBy(listing, by));
    }}
    onReverse={() => {
      onChoose(reversed(listing));
    }}
  />
</section>
<section class="flex flex-col pbs-lg">
  <h3 class="text-small font-semibold">{m.library_filter()}</h3>
  <ReadStateChoice
    filter={listing.filter}
    onChoose={(state: ReadState) => {
      onChoose(withReadState(listing, state));
    }}
  />
</section>
