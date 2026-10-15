<script lang="ts">
  import { ListFilter, X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import {
    DEFAULT_LIBRARY_LISTING,
    type LibraryListing,
  } from "#lib/ipc/bindings.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import FilterChoices from "./FilterChoices.svelte";

  const CLOSE_ICON_SIZE = 16;

  let {
    id,
    listing,
    matching,
    headHeight,
    onChoose,
    onClose,
  }: {
    id: string;
    listing: LibraryListing;
    matching: number | undefined;
    headHeight: number;
    onChoose: (listing: LibraryListing) => void;
    onClose: () => void;
  } = $props();

  const titleId = $props.id();

  function focusOnArrival(heading: HTMLElement): void {
    heading.focus();
  }

  function closesOnEscape(panel: HTMLElement): () => void {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    panel.addEventListener("keydown", closeOnEscape);
    return () => {
      panel.removeEventListener("keydown", closeOnEscape);
    };
  }
</script>

<aside
  {id}
  aria-labelledby={titleId}
  style:--docked-head="{headHeight}px"
  class="sticky inset-bs-docked-top flex flex-col self-start border-s border-sidebar-edge bg-sidebar block-docked-fill"
  {@attach closesOnEscape}
>
  <div class="flex items-center gap-md ps-lg pe-sm pbs-lg pbe-sm">
    <HeaderBadge icon={ListFilter} look="header-accent" />
    <h2
      {@attach focusOnArrival}
      id={titleId}
      tabindex="-1"
      class="flex-1 text-body font-semibold outline-none"
    >
      {m.library_filter_and_sort()}
    </h2>
    <Tooltip
      label={m.library_close_filter_and_sort()}
      aria-label={m.library_close_filter_and_sort()}
      onclick={onClose}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class="rounded-badge text-muted block-panel-button inline-panel-button"
        >
          <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  </div>
  <div class="flex flex-1 flex-col overflow-y-auto px-lg pbe-lg min-block-none">
    <FilterChoices {listing} {onChoose} />
  </div>
  <div
    class="flex items-center gap-sm border-bs border-border ps-lg pe-sm pbs-md pbe-md"
  >
    <p role="status" class="flex-1 text-small">
      {#if matching !== undefined}
        {m.library_series_match({ count: matching })}
      {/if}
    </p>
    <Button
      type="button"
      look="text"
      class="rounded-badge px-sm text-small block-panel-button"
      onclick={() => {
        onChoose(DEFAULT_LIBRARY_LISTING);
      }}
    >
      {m.library_reset()}
    </Button>
  </div>
</aside>
