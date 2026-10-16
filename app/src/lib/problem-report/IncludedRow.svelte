<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Glyph } from "#lib/page/glyph.ts";

  const ICON_SIZE = 16;

  let {
    icon: Icon,
    label,
    hint,
    action,
  }: {
    icon: Glyph;
    label: string;
    hint: string;
    action?: Snippet;
  } = $props();
</script>

<div class="flex items-center gap-md px-lg py-md min-block-touch-target">
  <span
    aria-hidden="true"
    class="flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile"
  >
    <Icon size={ICON_SIZE} />
  </span>
  <span class="flex flex-1 flex-col gap-2xs wrap-anywhere min-inline-none">
    <span class="font-medium expanded:font-semibold">{label}</span>
    <span class="text-detail text-muted">{hint}</span>
  </span>
  {@render action?.()}
</div>
