<script lang="ts">
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import type { BookPage, SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookStepLink from "#lib/reader/BookStepLink.svelte";
  import NearbyPages from "#lib/reader/NearbyPages.svelte";
  import PageSlider from "#lib/reader/PageSlider.svelte";
  import type { ReadingDirection } from "#lib/reader/reading-direction.svelte.ts";

  import { READER_GLASS } from "./reader-bar.ts";

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
  class={cn(
    READER_GLASS,
    "flex flex-col gap-sm p-sm expanded:justify-center expanded:py-none expanded:min-block-reader-top-wide",
  )}
>
  {#if isDragged}
    <NearbyPages {pages} {shown} />
  {/if}
  <div
    role="group"
    aria-label={m.reader_quick_settings()}
    class="flex flex-wrap items-stretch rounded-shadcn-control shadow-raised expanded:hidden"
  >
    {@render quickSettings()}
  </div>
  <div dir="ltr" class="flex items-center gap-xs expanded:gap-sm">
    <BookStepLink step="previous" neighbour={previous} />
    <span
      class="shrink-0 text-center text-small font-medium whitespace-nowrap tabular-nums min-inline-reader-count expanded:min-inline-reader-count-wide"
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
