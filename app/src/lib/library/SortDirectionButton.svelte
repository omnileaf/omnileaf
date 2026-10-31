<script lang="ts">
  import { ArrowDown, ArrowDownUp, ArrowUp } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { LibrarySort } from "#lib/ipc/bindings.ts";

  import { directionWording } from "./sort-labels";

  const LOOKS = {
    pill: "min-block-sort-direction rounded-full border-accent px-pill-inline text-detail text-accent",
    field: "block-panel-field px-pill-inline text-detail font-medium",
    material:
      "relative justify-center rounded-full border-native-button-outline-edge text-muted block-native-button inline-native-button before:absolute before:-inset-xs before:content-['']",
    icon: "justify-center block-panel-field inline-panel-field touch:block-touch-target touch:inline-touch-target android:rounded-full",
  } as const;

  const ICON_SIZE = 14;
  const MATERIAL_ICON_SIZE = 24;

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
  <span class={look === "icon" || look === "material" ? "sr-only" : undefined}>
    {wording.label()}
  </span>
  {#if look === "material"}
    <ArrowDownUp size={MATERIAL_ICON_SIZE} aria-hidden="true" />
  {:else if sort.direction === "ascending"}
    <ArrowUp size={ICON_SIZE} aria-hidden="true" />
  {:else}
    <ArrowDown size={ICON_SIZE} aria-hidden="true" />
  {/if}
</Button>
