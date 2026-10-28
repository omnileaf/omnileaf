<script lang="ts">
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import SectionCover from "./SectionCover.svelte";
  import SectionGap from "./SectionGap.svelte";
  import { sectionTileLook } from "./section-tile";
  import { type SectionTile, tileKey } from "./section-tiles";

  const BOOK_COVERS_TRACK =
    "grid-template-columns: repeat(auto-fill, minmax(calc(var(--spacing-book-cover-min) * var(--text-scale)), 1fr))";

  let {
    tiles,
    label,
    isComplete,
    onNearEnd,
    usesStandIns,
  }: {
    tiles: readonly SectionTile[];
    label: string;
    isComplete: boolean;
    onNearEnd: () => void;
    usesStandIns: boolean;
  } = $props();

  const look = sectionTileLook(currentPlatform());

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
    <SectionCover book={tile.book} cover={shownCover(tile.book)} {look} />
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
  style={BOOK_COVERS_TRACK}
  class="gap-x-lg gap-y-cover-row"
  itemClass="min-inline-none"
/>
