<script lang="ts">
  import { ArrowDownUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Toggle } from "#lib/components/ui/toggle/index.ts";
  import type { BooksShown, SeriesBookListing } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const SHOWN = [
    { shown: "all", label: m.series_show_all },
    { shown: "unread", label: m.series_show_unread },
  ] as const satisfies readonly {
    shown: BooksShown;
    label: () => string;
  }[];
  const ICON_SIZE = 15;

  let {
    listing,
    onChoose,
  }: {
    listing: SeriesBookListing;
    onChoose: (listing: SeriesBookListing) => void;
  } = $props();

  const isReversed = $derived(listing.direction === "descending");
</script>

<div class="flex flex-wrap items-center justify-between gap-sm">
  <div role="group" aria-label={m.series_show()} class="flex gap-icon-gap">
    {#each SHOWN as { shown, label } (shown)}
      <Toggle
        bind:pressed={
          () => listing.shown === shown,
          () => {
            onChoose({ ...listing, shown });
          }
        }
        data-label={label()}
      >
        {label()}
      </Toggle>
    {/each}
  </div>
  <Button
    type="button"
    look="chip"
    aria-label={isReversed
      ? m.series_order_last_first_change()
      : m.series_order_first_first_change()}
    title={isReversed
      ? m.series_order_last_first_change()
      : m.series_order_first_first_change()}
    class="flex shrink-0 items-center gap-icon-gap px-md text-detail block-scope-chip"
    onclick={() => {
      onChoose({
        ...listing,
        direction: isReversed ? "ascending" : "descending",
      });
    }}
  >
    <ArrowDownUp size={ICON_SIZE} aria-hidden="true" />
    <span class="grid">
      <span class={["col-start-1 row-start-1", isReversed && "invisible"]}>
        {m.series_order_first_first()}
      </span>
      <span class={["col-start-1 row-start-1", !isReversed && "invisible"]}>
        {m.series_order_last_first()}
      </span>
    </span>
  </Button>
</div>
