<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { chipsThatFit, type FilterChip } from "./filter-chips";
  import FilterChipItem from "./FilterChipItem.svelte";

  const MORE_CHIP =
    "shrink-0 rounded-control border border-border bg-card px-sm text-small font-medium block-search-chip touch:touch-target-around";

  let {
    chips,
    onRemove,
    onMore,
    onClearAll,
  }: {
    chips: readonly FilterChip[];
    onRemove: (id: string) => void;
    onMore: () => void;
    onClearAll: () => void;
  } = $props();

  let available = $state(0);
  let measured = $state({ widths: [] as number[], gap: 0, more: 0 });

  const shown = $derived(
    measured.widths.length === chips.length
      ? chipsThatFit({ ...measured, available })
      : chips.length,
  );
  const folded = $derived(chips.length - shown);

  function measures(list: HTMLElement): () => void {
    const measure = () => {
      const items = [...list.children].map(
        (item) => item.getBoundingClientRect().width,
      );
      measured = {
        widths: items.slice(0, -1),
        gap: Number.parseFloat(getComputedStyle(list).columnGap) || 0,
        more: items.at(-1) ?? 0,
      };
    };
    const observer = new ResizeObserver(measure);
    for (const item of list.children) {
      observer.observe(item);
    }
    measure();
    return () => {
      observer.disconnect();
    };
  }
</script>

<div class="flex items-center gap-sm pbs-md">
  <div bind:clientWidth={available} class="relative flex-1 min-inline-none">
    <ul
      aria-label={m.library_filters_in_use()}
      class="flex items-center gap-sm overflow-hidden"
    >
      {#each chips.slice(0, shown) as chip (chip.id)}
        <FilterChipItem
          label={chip.label}
          onRemove={() => {
            onRemove(chip.id);
          }}
        />
      {/each}
      {#if folded > 0}
        <li class="flex shrink-0">
          <Button
            type="button"
            look="quiet"
            aria-label={m.library_more_filters({ count: folded })}
            class={MORE_CHIP}
            onclick={onMore}
          >
            + {folded}
          </Button>
        </li>
      {/if}
    </ul>
    {#key chips}
      <ul
        {@attach measures}
        inert
        class="pointer-events-none invisible absolute inset-s-none inset-bs-none flex gap-sm"
      >
        {#each chips as chip (chip.id)}
          <FilterChipItem label={chip.label} onRemove={() => {}} />
        {/each}
        <li class="flex shrink-0">
          <span class={MORE_CHIP}>+ {chips.length}</span>
        </li>
      </ul>
    {/key}
  </div>
  <Button
    type="button"
    look="quiet"
    class="shrink-0 rounded-control px-sm text-small block-search-chip touch:touch-target-around"
    onclick={onClearAll}
  >
    {m.library_clear_all()}
  </Button>
</div>
