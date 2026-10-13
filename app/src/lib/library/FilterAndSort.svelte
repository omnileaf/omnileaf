<script lang="ts">
  import { ListFilter, X } from "@lucide/svelte";
  import { Dialog, Tabs } from "bits-ui";

  import {
    DEFAULT_LIBRARY_LISTING,
    type Inclusion,
    type LibraryListing,
    type LibrarySortBy,
  } from "#lib/ipc/bindings.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { TabsList, TabsTrigger } from "#lib/components/ui/tabs/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import FilterConditions from "./FilterConditions.svelte";
  import {
    type FilterCondition,
    filteredBy,
    filtersOn,
    reversed,
    sortedBy,
  } from "./library-listing";
  import SortChoices from "./SortChoices.svelte";
  import SortSelect from "./SortSelect.svelte";

  type Tab = "filter" | "sort";

  const ICON_SIZE = 22;
  const CLOSE_ICON_SIZE = 18;

  let {
    listing,
    matching,
    onChoose,
    onOpen,
  }: {
    listing: LibraryListing;
    matching: number | undefined;
    onChoose: (listing: LibraryListing) => void;
    onOpen: () => void;
  } = $props();

  let button: HTMLElement | null = $state(null);
  let isOpen = $state(false);
  let tab: string = $state("filter");

  const titleId = $props.id();
  const filtersCount = $derived(filtersOn(listing.filter));
  const numbers = $derived(new Intl.NumberFormat(getLocale()));
  const buttonLabel = $derived(
    filtersCount === 0
      ? m.library_filter_and_sort()
      : m.library_filter_and_sort_filtered({ count: filtersCount }),
  );
  const tabs = $derived([
    {
      name: "filter",
      label:
        filtersCount === 0
          ? m.library_filter()
          : m.library_filter_with_count({
              count: numbers.format(filtersCount),
            }),
    },
    { name: "sort", label: m.library_sort() },
  ] satisfies { name: Tab; label: string }[]);

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

  function sortBy(by: LibrarySortBy): void {
    onChoose(sortedBy(listing, by));
  }

  function reverse(): void {
    onChoose(reversed(listing));
  }

  function choose(condition: FilterCondition, inclusion: Inclusion): void {
    onChoose(filteredBy(listing, condition, inclusion));
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
        class="large:block-header-icon-desktop large:inline-header-icon-desktop"
      />
      <span class="hidden large:inline">{m.library_filter()}</span>
      {#if filtersCount > 0}
        <span
          aria-hidden="true"
          class="absolute inset-e-sm inset-bs-sm rounded-full border-2 border-background bg-accent block-active-dot inline-active-dot large:hidden"
        ></span>
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
          <HeaderBadge icon={ListFilter} tone="bg-accent-soft text-accent" />
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
          <Button
            type="button"
            look="icon"
            aria-label={m.library_close()}
            class="rounded-badge text-muted block-panel-button inline-panel-button"
            onclick={close}
          >
            <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
          </Button>
        </div>
        <div
          class="flex flex-1 flex-col gap-filter-panel-gap overflow-y-auto px-filter-panel-inline pbs-xs pbe-md min-block-none"
        >
          <SortSelect
            sort={listing.sort}
            onSortBy={sortBy}
            onReverse={reverse}
          />
          <div class="flex flex-col border-bs border-chip">
            <FilterConditions filter={listing.filter} onChoose={choose} />
          </div>
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
        <Tabs.Root bind:value={tab} class="contents">
          <div class="flex flex-col gap-md px-sheet-inline pbs-md pbe-xs">
            <div class="flex items-center gap-md">
              <HeaderBadge
                icon={ListFilter}
                tone="bg-accent-soft text-accent"
              />
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
            <TabsList aria-labelledby={titleId}>
              {#each tabs as choice (choice.name)}
                <TabsTrigger value={choice.name}>
                  <span
                    data-label={choice.label}
                    class="room-for-bold-label items-center"
                  >
                    {choice.label}
                  </span>
                </TabsTrigger>
              {/each}
            </TabsList>
          </div>
          <Tabs.Content
            value="filter"
            tabindex={-1}
            class="flex-1 overflow-y-auto min-block-none"
          >
            <div class="flex flex-col px-sheet-inline pbs-sm pbe-lg">
              <FilterConditions filter={listing.filter} onChoose={choose} />
            </div>
          </Tabs.Content>
          <Tabs.Content
            value="sort"
            tabindex={-1}
            class="flex-1 overflow-y-auto min-block-none"
          >
            <SortChoices
              sort={listing.sort}
              onSortBy={sortBy}
              onReverse={reverse}
            />
          </Tabs.Content>
        </Tabs.Root>
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
