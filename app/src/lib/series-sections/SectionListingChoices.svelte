<script lang="ts">
  import { ArrowDownUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import type { SortDirection } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    isSortDirection,
    ORDER_LABELS,
    ORDERS,
  } from "#lib/series/book-listing.ts";


  import BookSearchField from "./BookSearchField.svelte";

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

  const order = $derived(ORDER_LABELS[direction]());
</script>

<div class="ms-auto flex flex-1 items-center justify-end gap-sm">
  <BookSearchField {search} {onSearch} />
  <DropdownMenu>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          look="outline"
          aria-label={m.series_sort({ order })}
          class="flex shrink-0 items-center justify-center gap-sm rounded-shadcn-button border-transparent bg-transparent px-md text-small font-medium block-pointer-button hover:bg-hover android:max-medium:native-target"
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
          if (isSortDirection(chosen)) {
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
