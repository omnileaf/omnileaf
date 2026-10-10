<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let {
    shown,
    count,
    onSeek,
    onDrag,
  }: {
    shown: number;
    count: number;
    onSeek: (index: number) => void;
    onDrag: (isDragged: boolean) => void;
  } = $props();

  function letGo(): void {
    onDrag(false);
  }

  const progress = $derived(count > 1 ? shown / (count - 1) : 0);
</script>

<svelte:window onpointerup={letGo} onpointercancel={letGo} />

<div
  dir="ltr"
  class="relative flex-1 rounded-full block-reader-slider has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-reader-accent expanded:block-reader-slider-wide"
  style:--progress={String(progress)}
>
  <div
    class="absolute inset-x-reader-track-inset inset-y-none my-auto rounded-full bg-reader-track block-reader-track expanded:inset-x-reader-track-inset-wide expanded:bg-reader-track-wide"
  >
    <div
      class="absolute inset-y-none inset-s-none rounded-full bg-reader-accent reader-progress-fill"
    ></div>
  </div>
  <div
    class="absolute inset-y-none reader-progress-thumb my-auto rounded-full bg-on-reader shadow-reader-thumb block-reader-thumb inline-reader-thumb expanded:shadow-reader-thumb-wide expanded:block-reader-thumb-wide expanded:inline-reader-thumb-wide"
  ></div>
  <input
    type="range"
    min="1"
    max={count}
    value={shown + 1}
    aria-label={m.reader_slider()}
    aria-valuetext={m.reader_slider_value({ page: shown + 1, count })}
    class="absolute inset-none mx-none my-auto cursor-pointer opacity-0 block-full inline-full android:block-touch-target"
    oninput={(event) => {
      onSeek(Number(event.currentTarget.value) - 1);
    }}
    onpointerdown={() => {
      onDrag(true);
    }}
  />
</div>
