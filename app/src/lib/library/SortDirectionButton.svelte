<script lang="ts">
  import { ArrowDown, ArrowUp } from "@lucide/svelte";

  import type { LibrarySort } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  interface Wording {
    readonly label: () => string;
    readonly change: () => string;
  }

  /** How each sort names its two directions, ascending first. */
  const WORDING = {
    title: [
      { label: m.library_sort_a_to_z, change: m.library_sort_a_to_z_change },
      { label: m.library_sort_z_to_a, change: m.library_sort_z_to_a_change },
    ],
    dateAdded: [
      {
        label: m.library_sort_oldest_first,
        change: m.library_sort_oldest_first_change,
      },
      {
        label: m.library_sort_newest_first,
        change: m.library_sort_newest_first_change,
      },
    ],
  } satisfies Record<LibrarySort["by"], readonly [Wording, Wording]>;

  const LOOKS = {
    pill: "min-block-sort-direction rounded-full border-accent bg-card px-pill-inline text-detail font-semibold text-accent",
    field:
      "block-panel-field rounded-control border-border bg-card px-pill-inline text-detail font-medium",
  } as const;

  const ICON_SIZE = 14;

  let {
    sort,
    look,
    onReverse,
  }: {
    sort: LibrarySort;
    look: keyof typeof LOOKS;
    onReverse: () => void;
  } = $props();

  const [ascending, descending] = $derived(WORDING[sort.by]);
  const wording = $derived(
    sort.direction === "ascending" ? ascending : descending,
  );
</script>

<button
  type="button"
  aria-label={wording.change()}
  class={["flex shrink-0 items-center gap-xs border", LOOKS[look]]}
  onclick={onReverse}
>
  <span>{wording.label()}</span>
  {#if sort.direction === "ascending"}
    <ArrowUp size={ICON_SIZE} aria-hidden="true" />
  {:else}
    <ArrowDown size={ICON_SIZE} aria-hidden="true" />
  {/if}
</button>
