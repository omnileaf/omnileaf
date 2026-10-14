<script lang="ts">
  import { ArrowDownUp, Search } from "@lucide/svelte";

  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import {
    ToggleGroup,
    ToggleGroupItem,
  } from "#lib/components/ui/toggle-group/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type {
    BooksShown,
    SeriesBookListing,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  const SHOWN = [
    { shown: "all", label: m.series_show_all },
    { shown: "unread", label: m.series_show_unread },
    { shown: "bookmarked", label: m.series_show_bookmarked },
  ] as const satisfies readonly {
    shown: BooksShown;
    label: () => string;
  }[];
  const ORDERS = [
    { direction: "ascending", label: m.series_order_first_first },
    { direction: "descending", label: m.series_order_last_first },
  ] as const satisfies readonly {
    direction: SortDirection;
    label: () => string;
  }[];
  const ICON_SIZE = 16;

  const isWide = new MediaQuery(EXPANDED_QUERY);
  let isSearching = $state(false);
  let searchField = $state<HTMLInputElement | null>(null);

  async function reveal(): Promise<void> {
    isSearching = !isSearching;
    await tick();
    if (isSearching) {
      searchField?.focus();
    }
  }

  let {
    listing,
    onChoose,
    search,
    onSearch,
  }: {
    listing: SeriesBookListing;
    onChoose: (listing: SeriesBookListing) => void;
    search: string;
    onSearch: (search: string) => void;
  } = $props();

  const order = $derived(
    listing.direction === "descending"
      ? m.series_order_last_first()
      : m.series_order_first_first(),
  );

  function isShown(value: string): value is BooksShown {
    return SHOWN.some(({ shown }) => shown === value);
  }

  function isDirection(value: string): value is SortDirection {
    return ORDERS.some(({ direction }) => direction === value);
  }
</script>

<div class="flex flex-wrap items-center gap-sm">
  <InputGroup
    class={[
      "gap-sm rounded-shadcn-control border border-border bg-background px-md text-muted shadow-raised block-pointer-button inline-series-search focus-within:border-accent max-expanded:order-last max-expanded:block-touch-target max-expanded:inline-full",
      !isSearching && "max-expanded:hidden",
    ]}
  >
    <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
    <Input
      bind:ref={searchField}
      type="search"
      aria-label={m.series_find_book()}
      placeholder={m.series_find_book()}
      value={search}
      class="text-small text-foreground max-expanded:text-body"
      oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
        onSearch(event.currentTarget.value);
      }}
    />
  </InputGroup>
  <ToggleGroup
    aria-label={m.series_show()}
    class="max-expanded:flex-1"
    bind:value={
      () => listing.shown,
      (chosen: string) => {
        if (isShown(chosen)) {
          onChoose({ ...listing, shown: chosen });
        }
      }
    }
  >
    {#each SHOWN as { shown, label } (shown)}
      <ToggleGroupItem
        value={shown}
        data-label={label()}
        class="max-expanded:grow"
      >
        {label()}
      </ToggleGroupItem>
    {/each}
  </ToggleGroup>
  {#if !isWide.current}
    <Tooltip
      label={m.series_find_book()}
      type="button"
      aria-label={m.series_find_book()}
      aria-expanded={isSearching}
      onclick={() => {
        void reveal();
      }}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="outline"
          class="flex shrink-0 items-center justify-center rounded-shadcn-control font-medium shadow-raised block-touch-target inline-touch-target"
        >
          <Search size={ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  {/if}
  <DropdownMenu>
    <Tooltip label={isWide.current ? undefined : m.series_sort({ order })}>
      {#snippet child({ props: tip })}
        <DropdownMenuTrigger {...tip}>
          {#snippet child({ props })}
            <Button
              {...props}
              look="outline"
              aria-label={m.series_sort({ order })}
              class="flex shrink-0 items-center justify-center gap-sm rounded-shadcn-control font-medium block-touch-target max-expanded:shadow-raised max-expanded:inline-touch-target expanded:ms-auto expanded:rounded-shadcn-control expanded:border-transparent expanded:bg-transparent expanded:px-md expanded:text-small expanded:font-medium expanded:block-pointer-button expanded:hover:bg-hover"
            >
              <ArrowDownUp size={ICON_SIZE} aria-hidden="true" />
              <span class="grid max-expanded:hidden">
                {#each ORDERS as { direction, label } (direction)}
                  <span
                    class={[
                      "col-start-1 row-start-1",
                      listing.direction !== direction && "invisible",
                    ]}
                  >
                    {m.series_sort({ order: label() })}
                  </span>
                {/each}
              </span>
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
      {/snippet}
    </Tooltip>
    <DropdownMenuContent to="main" align="end" class="min-inline-book-menu">
      <DropdownMenuRadioGroup
        value={listing.direction}
        onValueChange={(chosen: string) => {
          if (isDirection(chosen)) {
            onChoose({ ...listing, direction: chosen });
          }
        }}
      >
        {#each ORDERS as { direction, label } (direction)}
          <DropdownMenuRadioItem value={direction}>
            {label()}
          </DropdownMenuRadioItem>
        {/each}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
