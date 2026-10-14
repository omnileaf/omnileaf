<script lang="ts">
  import type { Snippet } from "svelte";

  import type { BookPage, SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookStepLink from "#lib/reader/BookStepLink.svelte";
  import NearbyPages from "#lib/reader/NearbyPages.svelte";
  import PageSlider from "#lib/reader/PageSlider.svelte";
  import type { ReadingDirection } from "#lib/reader/reading-direction.svelte.ts";

  let {
    pages,
    shown,
    previous,
    next,
    direction,
    quickSettings,
    onSeek,
  }: {
    pages: readonly BookPage[];
    shown: number;
    previous: SeriesNeighbour | null;
    next: SeriesNeighbour | null;
    direction: ReadingDirection;
    quickSettings: Snippet;
    onSeek: (index: number) => void;
  } = $props();

  const count = $derived(pages.length);
  let isDragged = $state(false);
</script>

<div
  class="flex flex-col gap-reader-panel-gap rounded-reader-panel border border-reader-glass-edge bg-reader-glass px-reader-panel-inline pbs-reader-panel-top pbe-reader-panel-bottom shadow-reader-bar backdrop-blur-reader backdrop-saturate-140 expanded:rounded-reader-panel-wide expanded:bg-reader-glass-wide expanded:px-reader-panel-inline-wide expanded:pbe-reader-panel-bottom-wide expanded:shadow-reader-bar-wide"
>
  {#if isDragged}
    <NearbyPages {pages} {shown} />
  {/if}
  <div
    role="group"
    aria-label={m.reader_quick_settings()}
    class="flex gap-2xs border-be border-reader-line pbe-2xs expanded:hidden"
  >
    {@render quickSettings()}
  </div>
  <div dir="ltr" class="flex items-center gap-2xs expanded:gap-reader-dock-gap">
    <BookStepLink step="previous" neighbour={previous} />
    <span
      class="shrink-0 text-center text-caption font-bold whitespace-nowrap tabular-nums min-inline-reader-control expanded:text-detail"
    >
      {m.reader_position({ page: shown + 1, count })}
    </span>
    <PageSlider
      {shown}
      {count}
      {direction}
      {onSeek}
      onDrag={(dragged: boolean) => {
        isDragged = dragged;
      }}
    />
    <BookStepLink step="next" neighbour={next} />
  </div>
</div>
