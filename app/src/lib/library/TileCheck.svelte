<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { SeriesId } from "#lib/series/series-id.ts";

  import { coverTileLook } from "./cover-tile";
  import { seriesSelection } from "./series-selection";

  let {
    id,
    title,
    isVeiled,
  }: { id: SeriesId; title: string; isVeiled: boolean } = $props();

  const selection = seriesSelection();
  const tile = coverTileLook(currentPlatform());
</script>

{#if tile.hoverCheck !== undefined && selection !== undefined && !selection.isSelecting && !isVeiled}
  <button
    type="button"
    role="checkbox"
    aria-checked="false"
    aria-label={m.library_select_cover({ title })}
    tabindex="-1"
    data-slot="tile-check"
    class={cn(
      "absolute flex items-center justify-center opacity-0 transition-control group-focus-within/tile:opacity-100 group-hover/tile:opacity-100",
      tile.hoverCheck,
      tile.markOff,
    )}
    onclick={() => {
      selection.begin(id);
    }}
  ></button>
{/if}
