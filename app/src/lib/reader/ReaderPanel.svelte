<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import type { SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import BookStepLink from "#lib/reader/BookStepLink.svelte";
  import PageSlider from "#lib/reader/PageSlider.svelte";

  let {
    shown,
    count,
    previous,
    next,
    onSeek,
  }: {
    shown: number;
    count: number;
    previous: SeriesNeighbour | null;
    next: SeriesNeighbour | null;
    onSeek: (index: number) => void;
  } = $props();
</script>

<div
  class="flex flex-col-reverse gap-reader-panel-gap rounded-reader-panel border border-reader-glass-edge bg-reader-glass px-reader-panel-inline pbs-reader-panel-top pbe-reader-panel-bottom shadow-reader-bar backdrop-blur-reader backdrop-saturate-140 expanded:flex-row expanded:items-center expanded:gap-reader-dock-gap expanded:rounded-reader-panel-wide expanded:bg-reader-glass-wide expanded:px-reader-panel-inline-wide expanded:pbe-reader-panel-bottom-wide expanded:shadow-reader-bar-wide"
>
  <div
    dir="ltr"
    class="flex items-center gap-2xs expanded:flex-1 expanded:gap-reader-dock-gap"
  >
    <BookStepLink step="previous" neighbour={previous} />
    <PageSlider {shown} {count} {onSeek} />
    <BookStepLink step="next" neighbour={next} />
  </div>
  <div
    class="flex items-center justify-end gap-reader-dock-gap px-md expanded:px-none"
  >
    <span
      aria-hidden="true"
      class="bg-reader-line block-reader-divider inline-px max-expanded:hidden"
    ></span>
    <span class="text-caption font-bold whitespace-nowrap expanded:text-detail">
      {m.reader_position({ page: shown + 1, count })}
    </span>
  </div>
</div>
