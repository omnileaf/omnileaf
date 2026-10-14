<script lang="ts">
  import { ListFilter, X } from "@lucide/svelte";
  import { Dialog, Tabs } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";

  import {
    DEFAULT_LIBRARY_LISTING,
    type Inclusion,
    type LibraryListing,
    type LibrarySortBy,
  } from "#lib/ipc/bindings.ts";
  import {
    DialogContent,
    DialogTitle,
  } from "#lib/components/ui/dialog/index.ts";
  import { TabsList, TabsTrigger } from "#lib/components/ui/tabs/index.ts";
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

  const PANEL_SCREENS = "(min-width: 600px)";
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

  const isPanel = new MediaQuery(PANEL_SCREENS);

  let button: HTMLButtonElement | undefined = $state();
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

<button
  bind:this={button}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={buttonLabel}
  title={buttonLabel}
  class={[
    "relative flex items-center justify-center gap-sm rounded-full transition-control block-touch-target inline-touch-target large:rounded-control large:border large:border-field large:ps-header-control-inline large:pe-md large:text-small large:font-medium large:block-pointer-button large:inline-auto",
    isOpen
      ? "large:bg-accent-soft"
      : "hover:tint-hover active:tint-pressed large:bg-card",
  ]}
  onclick={open}
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
</button>

<Dialog.Root bind:open={isOpen}>
  <DialogContent
    class="inset-none flex flex-col overflow-hidden border-border bg-card text-foreground max-block-full max-inline-full max-medium:inset-bs-sheet-top max-medium:sheet-motion max-medium:rounded-ss-bottom-sheet max-medium:rounded-se-bottom-sheet max-medium:inline-full medium:inset-s-auto medium:side-panel-motion medium:border-s medium:side-panel-shadow medium:inline-filter-panel"
    scrimClass="medium:bg-transparent"
    onCloseAutoFocus={focusButton}
  >
    {#if isPanel.current}
      <div
        class="flex items-center gap-md ps-filter-panel-inline pe-lg pbs-filter-panel-top pbe-filter-panel-title-gap"
      >
        <HeaderBadge icon={ListFilter} tone="bg-accent-soft text-accent" />
        <DialogTitle class="flex-1 text-panel-title font-bold">
          {m.library_filter_and_sort()}
        </DialogTitle>
        <button
          type="button"
          class="rounded-badge px-sm text-detail font-semibold text-accent block-panel-button"
          onclick={() => {
            onChoose(DEFAULT_LIBRARY_LISTING);
          }}
        >
          {m.library_reset()}
        </button>
        <button
          type="button"
          aria-label={m.library_close()}
          class="flex items-center justify-center rounded-badge text-muted block-panel-button inline-panel-button"
          onclick={close}
        >
          <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
        </button>
      </div>
      <div
        class="flex flex-1 flex-col gap-filter-panel-gap overflow-y-auto px-filter-panel-inline pbs-xs pbe-md min-block-none"
      >
        <SortSelect sort={listing.sort} onSortBy={sortBy} onReverse={reverse} />
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
        <div class="flex flex-col gap-md px-sheet-inline pbs-sm pbe-xs">
          <span
            aria-hidden="true"
            class="self-center rounded-full bg-step-off block-sheet-handle-block inline-sheet-handle"
          ></span>
          <div class="flex items-center gap-md">
            <HeaderBadge icon={ListFilter} tone="bg-accent-soft text-accent" />
            <DialogTitle id={titleId} class="flex-1 text-title font-bold">
              {m.library_filter_and_sort()}
            </DialogTitle>
            <button
              type="button"
              class="px-xs text-body font-semibold text-accent min-block-touch-target"
              onclick={() => {
                onChoose(DEFAULT_LIBRARY_LISTING);
              }}
            >
              {m.library_reset()}
            </button>
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
        <button
          type="button"
          class="rounded-control bg-accent text-body font-semibold text-on-accent inline-full min-block-touch-target"
          onclick={close}
        >
          {matching === undefined
            ? m.library_view_done()
            : m.library_show_series({ count: matching })}
        </button>
      </div>
    {/if}
  </DialogContent>
</Dialog.Root>
