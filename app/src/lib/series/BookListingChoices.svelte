<script lang="ts">
  import { ArrowDownUp } from "@lucide/svelte";

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
      {@const isPressed = listing.shown === shown}
      <button
        type="button"
        aria-pressed={isPressed}
        data-label={label()}
        class={[
          "room-for-bold-label shrink-0 items-center justify-center rounded-full border px-md text-detail whitespace-nowrap block-scope-chip",
          isPressed
            ? "border-accent bg-accent-soft font-bold"
            : "border-border font-medium",
        ]}
        onclick={() => {
          onChoose({ ...listing, shown });
        }}
      >
        {label()}
      </button>
    {/each}
  </div>
  <button
    type="button"
    aria-label={isReversed
      ? m.series_order_last_first_change()
      : m.series_order_first_first_change()}
    title={isReversed
      ? m.series_order_last_first_change()
      : m.series_order_first_first_change()}
    class="flex shrink-0 items-center gap-icon-gap rounded-full border border-border bg-card px-md text-detail font-semibold block-scope-chip hover:bg-hover"
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
  </button>
</div>
