<script lang="ts">
  import { ListFilter, X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type {
    LibraryFilterChoices,
    LibraryListing,
  } from "#lib/ipc/bindings.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { MAC_INSPECTOR } from "./filter-sheet-look";
  import FilterChoices from "./FilterChoices.svelte";
  import { NEW_LIBRARY_LISTING } from "./library-listing";

  const CLOSE_ICON_SIZE = 16;

  let {
    id,
    listing,
    choices,
    matching,
    headHeight,
    onChoose,
    onClose,
  }: {
    id: string;
    listing: LibraryListing;
    choices: LibraryFilterChoices;
    matching: number | undefined;
    headHeight: number;
    onChoose: (listing: LibraryListing) => void;
    onClose: () => void;
  } = $props();

  const titleId = $props.id();
  const isMac = currentPlatform() === "macos";

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
  data-macos-inspector={isMac ? "" : undefined}
  style:--docked-head="{headHeight}px"
  class={isMac
    ? "fixed inset-y-none inset-e-none z-series-bar flex flex-col border-s border-border bg-background inline-native-inspector"
    : "sticky inset-bs-docked-top flex flex-col self-start border-s border-sidebar-edge bg-sidebar block-docked-fill"}
  {@attach closesOnEscape}
>
  <div
    class={isMac
      ? "flex items-center px-lg min-block-toolbar"
      : "flex items-center gap-md ps-lg pe-sm pbs-lg pbe-sm"}
  >
    {#if !isMac}
      <HeaderBadge
        icon={ListFilter}
        look="header-accent"
        class="windows:hidden"
      />
    {/if}
    <h2
      {@attach focusOnArrival}
      id={titleId}
      tabindex="-1"
      class={[
        "flex-1 outline-none",
        isMac ? MAC_INSPECTOR.heading : "text-body font-semibold",
      ]}
    >
      {m.library_filter_and_sort()}
    </h2>
    {#if !isMac}
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
    {/if}
  </div>
  <div class="flex flex-1 flex-col overflow-y-auto px-lg pbe-lg min-block-none">
    <FilterChoices {listing} {choices} {onChoose} />
  </div>
  <div
    class={[
      "flex items-center gap-sm border-bs border-border pbs-md pbe-md",
      isMac ? "px-lg" : "ps-lg pe-sm",
    ]}
  >
    <p role="status" class="flex-1 text-small">
      {#if matching !== undefined}
        {m.library_series_match({ count: matching })}
      {/if}
    </p>
    <Button
      type="button"
      {...isMac
        ? { variant: "secondary", size: "small" }
        : {
            look: "text",
            class: "rounded-badge px-sm text-small block-panel-button",
          }}
      onclick={() => {
        onChoose(NEW_LIBRARY_LISTING);
      }}
    >
      {m.library_reset()}
    </Button>
  </div>
</aside>
