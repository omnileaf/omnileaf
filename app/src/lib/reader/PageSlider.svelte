<script lang="ts">
  import { Slider } from "bits-ui";

  import { m } from "#lib/paraglide/messages.js";

  import type { ReadingDirection } from "#lib/reader/reading-direction.svelte.ts";

  const DIR_ATTRIBUTES = {
    leftToRight: "ltr",
    rightToLeft: "rtl",
  } as const satisfies Record<ReadingDirection, string>;

  let {
    shown,
    count,
    direction,
    onSeek,
    onDrag,
  }: {
    shown: number;
    count: number;
    direction: ReadingDirection;
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

<div dir={DIR_ATTRIBUTES[direction]} class="flex flex-1 min-inline-none">
  <Slider.Root
    type="single"
    min={1}
    max={count}
    step={1}
    value={shown + 1}
    dir={DIR_ATTRIBUTES[direction]}
    thumbPositioning="exact"
    onValueChange={seekTo}
    onValueCommit={() => {
      onDrag(false);
    }}
    class="relative flex-1 rounded-full block-reader-dense has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent desktop:expanded:block-lg"
    style={`--progress: ${String(progress)}`}
    onpointerdown={() => {
      onDrag(true);
    }}
  >
    <div
      class="absolute inset-none my-auto overflow-hidden rounded-full bg-chip block-slider-track"
    >
      <div
        class="absolute inset-y-none inset-s-none bg-accent reader-progress-fill"
      ></div>
    </div>
    <div
      class="absolute inset-y-none reader-progress-thumb my-auto rounded-full border border-accent bg-background shadow-card-rest block-lg inline-lg"
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
</div>
