<script lang="ts">
  import { ListFilter, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import {
    DEFAULT_LIBRARY_LISTING,
    type LibraryListing,
  } from "#lib/ipc/bindings.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import FilterChoices from "./FilterChoices.svelte";
  import { filtersOn } from "./library-listing";

  const ICON_SIZE = 16;
  const CLOSE_ICON_SIZE = 18;

  let {
    listing,
    matching,
    isOpen = $bindable(false),
    onChoose,
    onOpen,
  }: {
    listing: LibraryListing;
    matching: number | undefined;
    isOpen?: boolean;
    onChoose: (listing: LibraryListing) => void;
    onOpen: () => void;
  } = $props();

  let button: HTMLElement | null = $state(null);

  const titleId = $props.id();
  const filtersCount = $derived(filtersOn(listing.filter));
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
  const buttonLabel = $derived(
    filtersCount === 0
      ? m.library_filter_and_sort()
      : m.library_filter_and_sort_filtered({ count: filtersCount }),
  );

  function open(): void {
    isOpen = true;
    onOpen();
  }

  function close(): void {
    isOpen = false;
  }

  function focusButton(event: Event): void {
    event.preventDefault();
    button?.focus();
  }
</script>

<Tooltip
  bind:ref={button}
  label={buttonLabel}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={buttonLabel}
  onclick={open}
>
  {#snippet child({ props })}
    <Button
      {...props}
      look="header-control"
      class={[
        "relative block-touch-target inline-touch-target large:ps-header-control-inline large:pe-md large:block-pointer-button large:inline-auto",
        isOpen
          ? "large:bg-accent-soft"
          : "hover:tint-hover active:tint-pressed large:bg-card",
      ]}
    >
      <ListFilter
        size={ICON_SIZE}
        aria-hidden="true"
        class="large:block-lg large:inline-lg"
      />
      <span class="hidden large:inline">{m.library_filter()}</span>
      {#if filtersCount > 0}
        <span
          aria-hidden="true"
          class="absolute inset-e-2xs inset-bs-2xs flex items-center justify-center rounded-full border-2 border-background bg-accent px-2xs text-caption font-bold text-on-accent min-inline-filter-badge large:hidden"
        >
          {numbers.format(filtersCount)}
        </span>
        <span
          aria-hidden="true"
          class="hidden rounded-full bg-accent px-icon-gap text-center text-caption font-bold text-on-accent min-inline-filter-badge large:inline"
        >
          {numbers.format(filtersCount)}
        </span>
      {/if}
    </Button>
  {/snippet}
</Tooltip>

<Dialog.Root bind:open={isOpen}>
  <ModalContent
    wideLook="sheet"
    wideClass="inline-filter-panel"
    phoneClass="inset-bs-sheet-top block-auto"
    onDismiss={close}
    onCloseAutoFocus={focusButton}
  >
    {#snippet children(view)}
      {#if view === "wide"}
        <div
          class="flex items-center gap-md ps-filter-panel-inline pe-lg pbs-filter-panel-top pbe-filter-panel-title-gap"
        >
          <HeaderBadge icon={ListFilter} look="header-accent" />
          <DialogTitle class="flex-1 text-panel-title font-bold">
            {m.library_filter_and_sort()}
          </DialogTitle>
          <Button
            type="button"
            look="text"
            class="rounded-badge px-sm text-detail block-panel-button"
            onclick={() => {
              onChoose(DEFAULT_LIBRARY_LISTING);
            }}
          >
            {m.library_reset()}
          </Button>
          <Tooltip
            label={m.library_close()}
            aria-label={m.library_close()}
            onclick={close}
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
        <div
          class="flex flex-1 flex-col gap-filter-panel-gap overflow-y-auto px-filter-panel-inline pbs-xs pbe-md min-block-none"
        >
          <FilterChoices {listing} {onChoose} />
        </div>
        <div
          class="flex items-center border-bs border-border px-filter-panel-inline pbs-md pbe-lg"
        >
          <p role="status" class="flex-1 text-detail text-muted">
            {#if matching !== undefined}
              {m.library_series_match({ count: matching })}
            {/if}
          </p>
        </div>
      {:else}
        <div class="flex items-center gap-md px-sheet-inline pbs-md pbe-xs">
          <HeaderBadge icon={ListFilter} look="header-accent" />
          <DialogTitle id={titleId} class="flex-1 text-title font-bold">
            {m.library_filter_and_sort()}
          </DialogTitle>
          <Button
            type="button"
            look="text"
            class="px-xs text-body min-block-touch-target"
            onclick={() => {
              onChoose(DEFAULT_LIBRARY_LISTING);
            }}
          >
            {m.library_reset()}
          </Button>
        </div>
        <div
          class="flex flex-1 flex-col overflow-y-auto px-sheet-inline pbs-sm pbe-lg min-block-none"
        >
          <FilterChoices {listing} {onChoose} />
        </div>
        <div
          class="border-bs border-border px-sheet-inline pbs-md pbe-sheet-bottom"
        >
          <p role="status" class="sr-only">
            {#if matching !== undefined}
              {m.library_series_match({ count: matching })}
            {/if}
          </p>
          <Button
            type="button"
            look="filled"
            class="rounded-control text-body font-semibold inline-full min-block-touch-target"
            onclick={close}
          >
            {matching === undefined
              ? m.library_view_done()
              : m.library_show_series({ count: matching })}
          </Button>
        </div>
      {/if}
    {/snippet}
  </ModalContent>
</Dialog.Root>
