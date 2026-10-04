<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import PageSlider from "#lib/reader/PageSlider.svelte";

  let {
    shown,
    count,
    onSeek,
  }: { shown: number; count: number; onSeek: (index: number) => void } =
    $props();
</script>

<div
  class="flex flex-col-reverse gap-reader-panel-gap rounded-reader-panel border border-reader-glass-edge bg-reader-glass px-reader-panel-inline pbs-reader-panel-top pbe-reader-panel-bottom shadow-reader-bar backdrop-blur-reader backdrop-saturate-140 expanded:flex-row expanded:items-center expanded:gap-reader-dock-gap expanded:rounded-reader-panel-wide expanded:bg-reader-glass-wide expanded:px-reader-panel-inline-wide expanded:pbe-reader-panel-bottom-wide expanded:shadow-reader-bar-wide"
>
  <PageSlider {shown} {count} {onSeek} />
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
