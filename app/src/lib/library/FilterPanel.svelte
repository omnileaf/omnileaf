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

  import { DOCKED_PANEL, MAC_INSPECTOR_PANEL } from "./filter-sheet-look";
  import FilterChoices from "./FilterChoices.svelte";
  import { NEW_LIBRARY_LISTING } from "./library-listing";
  import { scrollRulesOf } from "./sheet-scroll-rules";

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
  const look = isMac ? MAC_INSPECTOR_PANEL : DOCKED_PANEL;
  let isScrolled = $state(false);

  function followsScroll(body: HTMLElement): () => void {
    const follow = () => {
      isScrolled = scrollRulesOf(body).above;
    };
    body.addEventListener("scroll", follow, { passive: true });
    return () => {
      body.removeEventListener("scroll", follow);
    };
  }

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
  class={look.aside}
  {@attach closesOnEscape}
>
  <div class={[look.head, isScrolled && look.headRule]}>
    {#if look.hasBadgeAndClose}
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
      class={["flex-1 outline-none", look.title]}
    >
      {m.library_filter_and_sort()}
    </h2>
    {#if look.hasBadgeAndClose}
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
  <div
    {@attach followsScroll}
    class="flex flex-1 flex-col overflow-y-auto px-lg pbe-lg min-block-none"
  >
    <FilterChoices {listing} {choices} {onChoose} isInspector={isMac} />
  </div>
  <div class={["flex items-center gap-sm border-bs border-border", look.foot]}>
    <p role="status" class={look.count}>
      {#if matching !== undefined}
        {m.library_series_match({ count: matching })}
      {/if}
    </p>
    <Button
      type="button"
      {...look.reset}
      onclick={() => {
        onChoose(NEW_LIBRARY_LISTING);
      }}
    >
      {m.library_reset()}
    </Button>
  </div>
</aside>
