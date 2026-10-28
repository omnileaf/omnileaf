<script lang="ts">
  import { ArrowDownUp, Search } from "@lucide/svelte";

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
  import type { SortDirection } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ORDERS = [
    { direction: "ascending", label: m.series_order_first_first },
    { direction: "descending", label: m.series_order_last_first },
  ] as const satisfies readonly {
    direction: SortDirection;
    label: () => string;
  }[];
  const ICON_SIZE = 16;

  let {
    direction,
    onDirection,
    search,
    onSearch,
  }: {
    direction: SortDirection;
    onDirection: (direction: SortDirection) => void;
    search: string;
    onSearch: (search: string) => void;
  } = $props();

  const order = $derived(
    direction === "descending"
      ? m.series_order_last_first()
      : m.series_order_first_first(),
  );

  function isDirection(value: string): value is SortDirection {
    return ORDERS.some((one) => one.direction === value);
  }
</script>

<div class="ms-auto flex flex-1 items-center justify-end gap-sm">
  <InputGroup
    class="flex-1 gap-sm rounded-shadcn-control border border-border bg-background px-md text-muted shadow-raised block-pointer-button max-inline-section-search min-inline-section-search-narrowest focus-within:border-accent"
  >
    <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
    <Input
      type="search"
      aria-label={m.series_find_book()}
      placeholder={m.series_find_book()}
      value={search}
      class="text-small text-foreground"
      oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
        onSearch(event.currentTarget.value);
      }}
    />
  </InputGroup>
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          look="outline"
          aria-label={m.series_sort({ order })}
          class="flex shrink-0 items-center justify-center gap-sm rounded-shadcn-button border-transparent bg-transparent px-md text-small font-medium block-pointer-button hover:bg-hover"
        >
          <ArrowDownUp size={ICON_SIZE} aria-hidden="true" />
          <span class="grid">
            {#each ORDERS as one (one.direction)}
              <span
                class={[
                  "col-start-1 row-start-1",
                  direction !== one.direction && "invisible",
                ]}
              >
                {m.series_sort({ order: one.label() })}
              </span>
            {/each}
          </span>
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent to="main" align="end" class="min-inline-book-menu">
      <DropdownMenuRadioGroup
        value={direction}
        onValueChange={(chosen: string) => {
          if (isDirection(chosen)) {
            onDirection(chosen);
          }
        }}
      >
        {#each ORDERS as one (one.direction)}
          <DropdownMenuRadioItem value={one.direction}>
            {one.label()}
          </DropdownMenuRadioItem>
        {/each}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</div>
