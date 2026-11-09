<script lang="ts">
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import type { Selection } from "#lib/page/selection.svelte.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import SectionCover from "./SectionCover.svelte";
  import SectionGap from "./SectionGap.svelte";
  import { coversTrack, sectionTileLook } from "./section-tile";
  import { bookIdsOf, type SectionTile, tileKey } from "./section-tiles";

  let {
    tiles,
    label,
    isComplete,
    onNearEnd,
    usesStandIns,
    selection,
  }: {
    tiles: readonly SectionTile[];
    label: string;
    isComplete: boolean;
    onNearEnd: () => void;
    usesStandIns: boolean;
    selection: Selection<SeriesBook["id"]> | undefined;
  } = $props();

  const platform = currentPlatform();
  const look = sectionTileLook(platform);
  const width = new WindowWidth();
  const bookOrder = () => bookIdsOf(tiles);

  function shownCover(book: SeriesBook): ShownCover {
    if (usesStandIns) {
      return { kind: "standIn" };
    }
    return book.cover === null
      ? { kind: "none" }
      : { kind: "picture", path: book.cover };
  }
</script>

{#snippet cell(tile: SectionTile)}
  {#if tile.kind === "book"}
    <SectionCover
      book={tile.book}
      cover={shownCover(tile.book)}
      {look}
      {selection}
      order={bookOrder}
    />
  {:else}
    <SectionGap missing={tile.missing} {look} />
  {/if}
{/snippet}

<VirtualGrid
  items={tiles}
  key={tileKey}
  {label}
  {isComplete}
  {onNearEnd}
  {cell}
  style={coversTrack(platform, width.current)}
  class="gap-x-lg gap-y-cover-row"
  itemClass="min-inline-none"
/>
