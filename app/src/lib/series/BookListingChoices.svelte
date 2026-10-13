<script lang="ts">
  import { ArrowDownUp, ChevronDown, Search } from "@lucide/svelte";

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
  import type {
    BooksShown,
    SeriesBookListing,
    SortDirection,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const SHOWN = [
    { shown: "all", label: m.series_show_all },
    { shown: "unread", label: m.series_show_unread },
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
  const ICON_SIZE = 15;

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
    class="gap-sm rounded-control border border-field bg-card px-sm text-muted block-pointer-target inline-series-search focus-within:border-accent"
  >
    <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
    <Input
      type="search"
      aria-label={m.series_find_book()}
      placeholder={m.series_find_book()}
      value={search}
      class="text-detail text-foreground"
      oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
        onSearch(event.currentTarget.value);
      }}
    />
  </InputGroup>
  <ToggleGroup
    aria-label={m.series_show()}
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
      <ToggleGroupItem value={shown} data-label={label()}>
        {label()}
      </ToggleGroupItem>
    {/each}
  </ToggleGroup>
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          look="outline"
          aria-label={m.series_sort({ order })}
          class="ms-auto flex shrink-0 items-center gap-icon-gap px-md text-detail block-pointer-target"
        >
          <ArrowDownUp size={ICON_SIZE} aria-hidden="true" />
          <span class="grid">
            {#each ORDERS as { direction, label } (direction)}
              <span
                class={[
                  "col-start-1 row-start-1",
                  listing.direction !== direction && "invisible",
                ]}
              >
                {label()}
              </span>
            {/each}
          </span>
          <ChevronDown size={ICON_SIZE} aria-hidden="true" class="text-muted" />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
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
