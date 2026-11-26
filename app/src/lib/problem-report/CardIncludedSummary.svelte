<script lang="ts">
  import type { IncludedSummaryProps } from "./report-row-props.ts";
  import { ICON_TILE, TILE_ICON_SIZE } from "./report-rows-look.ts";

  let { icon: Icon, label, hint, action }: IncludedSummaryProps = $props();
</script>

<div class="flex items-center gap-md px-lg py-md min-block-touch-target">
  <span aria-hidden="true" class={ICON_TILE}>
    <Icon size={TILE_ICON_SIZE} />
  </span>
  <span class="flex flex-1 flex-col gap-2xs wrap-anywhere min-inline-none">
    <span class="font-medium expanded:font-semibold">{label}</span>
    <span class="text-detail text-muted">{hint}</span>
  </span>
  {@render action?.()}
</div>
