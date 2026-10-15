<script lang="ts">
  import { X } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { LibraryListing } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    type ReadState,
    readStateOf,
    withoutFilters,
    withReadState,
  } from "./library-listing";

  const REMOVE_ICON_SIZE = 12;
  const CHIP_LABELS = {
    any: m.library_read_state_any,
    unread: m.library_read_state_unread,
    inProgress: m.library_read_state_in_progress,
    read: m.library_read_state_read,
  } satisfies Record<ReadState, () => string>;

  let {
    listing,
    onChoose,
  }: {
    listing: LibraryListing;
    onChoose: (listing: LibraryListing) => void;
  } = $props();

  const readState = $derived(readStateOf(listing.filter));
</script>

<div class="flex items-center gap-sm pbs-md">
  <ul
    aria-label={m.library_filters_in_use()}
    class="flex flex-1 items-center gap-sm overflow-hidden min-inline-none"
  >
    {#if readState !== "any"}
      {@const label = CHIP_LABELS[readState]()}
      {@const removeLabel = m.library_remove_filter({ filter: label })}
      <Badge
        look="filter"
        class="ps-search-chip-start pe-2xs block-search-chip"
      >
        {#snippet child({ props })}
          <li {...props}>
            {label}
            <Tooltip
              label={removeLabel}
              type="button"
              aria-label={removeLabel}
              onclick={() => {
                onChoose(withReadState(listing, "any"));
              }}
            >
              {#snippet child({ props: removeProps })}
                <Button
                  {...removeProps}
                  look="icon"
                  class="block-chip-remove inline-chip-remove touch:touch-target-around"
                >
                  <X
                    size={REMOVE_ICON_SIZE}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </Button>
              {/snippet}
            </Tooltip>
          </li>
        {/snippet}
      </Badge>
    {/if}
  </ul>
  <Button
    type="button"
    look="quiet"
    class="shrink-0 rounded-control px-sm text-small block-search-chip touch:touch-target-around"
    onclick={() => {
      onChoose(withoutFilters(listing));
    }}
  >
    {m.library_clear_all()}
  </Button>
</div>
