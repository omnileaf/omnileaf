<script lang="ts">
  import { ArrowDown, ArrowUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { LibrarySort } from "#lib/ipc/bindings.ts";

  import { directionWording } from "./sort-labels";

  const LOOKS = {
    pill: "min-block-sort-direction rounded-full border-accent px-pill-inline text-detail text-accent",
    field: "block-panel-field px-pill-inline text-detail font-medium",
    icon: "justify-center block-panel-field inline-panel-field touch:block-touch-target touch:inline-touch-target android:rounded-full",
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

  const wording = $derived(directionWording(sort));
</script>

<Button
  type="button"
  look="outline"
  aria-label={wording.change()}
  class={["flex shrink-0 items-center gap-xs", LOOKS[look]]}
  onclick={onReverse}
>
  <span class={look === "icon" ? "sr-only" : undefined}>{wording.label()}</span>
  {#if sort.direction === "ascending"}
    <ArrowUp size={ICON_SIZE} aria-hidden="true" />
  {:else}
    <ArrowDown size={ICON_SIZE} aria-hidden="true" />
  {/if}
</Button>
