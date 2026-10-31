<script lang="ts">
  import { tick } from "svelte";

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

  async function startPicking(event: MouseEvent): Promise<void> {
    const cell =
      event.currentTarget instanceof Element
        ? event.currentTarget.closest("[data-series-id]")
        : null;
    selection?.begin(id);
    await tick();
    cell?.querySelector<HTMLElement>("[data-pickable-link]")?.focus();
  }
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
      "pointer-events-none absolute flex items-center justify-center opacity-0 transition-control group-focus-within/tile:pointer-events-auto group-focus-within/tile:opacity-100 group-hover/tile:pointer-events-auto group-hover/tile:opacity-100",
      tile.hoverCheck,
    )}
    onclick={startPicking}
  >
    <span
      aria-hidden="true"
      data-slot="tile-check-box"
      class={cn("border", tile.hoverCheckBox, tile.markOff)}
    ></span>
  </button>
{/if}
