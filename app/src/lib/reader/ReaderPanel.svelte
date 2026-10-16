<script lang="ts">
  import { Clock } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import type { BookPage, SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookStepLink from "#lib/reader/BookStepLink.svelte";
  import NearbyPages from "#lib/reader/NearbyPages.svelte";
  import PageSlider from "#lib/reader/PageSlider.svelte";
  import type { ReadingDirection } from "#lib/reader/reading-direction.svelte.ts";

  import { READER_GLASS } from "./reader-bar.ts";
  import { type Spread, spreadPosition } from "./spreads.ts";

  const TIME_ICON_SIZE = 14;
  const SECONDS_IN_A_MINUTE = 60;

  let {
    pages,
    shown,
    spread,
    previous,
    next,
    direction,
    quickSettings,
    secondsLeft,
    isBlank,
    showsPreviews,
    onSeek,
  }: {
    pages: readonly BookPage[];
    shown: number;
    spread: Spread;
    previous: SeriesNeighbour | null;
    next: SeriesNeighbour | null;
    direction: ReadingDirection;
    quickSettings: Snippet;
    secondsLeft: number | undefined;
    isBlank: boolean;
    showsPreviews: boolean;
    onSeek: (index: number) => void;
  } = $props();

  const count = $derived(pages.length);
  let isDragged = $state(false);
</script>

<div
  class={cn(
    READER_GLASS,
    "flex flex-col gap-sm p-sm expanded:justify-center expanded:min-block-reader-top-wide large:py-none",
  )}
>
  {#if isDragged && showsPreviews}
    <NearbyPages {pages} {shown} {isBlank} />
  {/if}
  <div
    role="group"
    aria-label={m.reader_quick_settings()}
    class="flex flex-wrap items-stretch rounded-shadcn-control shadow-raised large:hidden"
  >
    {@render quickSettings()}
  </div>
  <div dir="ltr" class="flex items-center gap-xs expanded:gap-sm">
    <BookStepLink step="previous" neighbour={previous} />
    <span
      class="shrink-0 text-center text-small font-medium whitespace-nowrap tabular-nums min-inline-reader-count expanded:min-inline-reader-count-wide"
    >
      {spreadPosition(spread, count)}
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
  {#if secondsLeft !== undefined}
    <p
      class="flex items-center justify-center gap-xs text-caption text-reader-muted"
    >
      <Clock size={TIME_ICON_SIZE} aria-hidden="true" />
      {secondsLeft < SECONDS_IN_A_MINUTE
        ? m.reader_time_left_short()
        : m.reader_time_left({
            minutes: Math.round(secondsLeft / SECONDS_IN_A_MINUTE),
          })}
    </p>
  {/if}
</div>
