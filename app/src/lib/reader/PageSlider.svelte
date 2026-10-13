<script lang="ts">
  import { Slider } from "bits-ui";

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

  function seekTo(page: number): void {
    onSeek(page - 1);
  }

  function propsWithoutStyle(props: unknown): Record<string, unknown> {
    if (typeof props !== "object" || props === null) {
      return {};
    }
    const kept: Record<string, unknown> = {
      ...(props as Record<string, unknown>),
    };
    delete kept.style;
    return kept;
  }

  const progress = $derived(count > 1 ? shown / (count - 1) : 0);
</script>

<svelte:window onpointerup={letGo} onpointercancel={letGo} />

<Slider.Root
  type="single"
  min={1}
  max={count}
  step={1}
  value={shown + 1}
  dir="ltr"
  thumbPositioning="exact"
  onValueChange={seekTo}
  onValueCommit={() => {
    onDrag(false);
  }}
  class="relative flex-1 rounded-full block-reader-slider has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-reader-accent expanded:block-reader-slider-wide"
  style={`--progress: ${String(progress)}`}
  onpointerdown={() => {
    onDrag(true);
  }}
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
  <Slider.Thumb index={0}>
    {#snippet child({ props })}
      <input
        {...propsWithoutStyle(props)}
        type="range"
        min="1"
        max={count}
        value={shown + 1}
        aria-label={m.reader_slider()}
        aria-valuetext={m.reader_slider_value({ page: shown + 1, count })}
        class="absolute inset-none mx-none my-auto cursor-pointer opacity-0 block-full inline-full android:block-touch-target"
        oninput={(event) => {
          seekTo(Number(event.currentTarget.value));
        }}
      />
    {/snippet}
  </Slider.Thumb>
</Slider.Root>
