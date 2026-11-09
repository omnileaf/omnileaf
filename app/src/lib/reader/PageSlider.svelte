<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  import { pageSliderLook } from "#lib/reader/page-slider-look.ts";
  import ProgressSlider from "#lib/reader/ProgressSlider.svelte";
  import { getReaderChrome } from "#lib/reader/reader-chrome.svelte.ts";
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
    onFocusChange,
  }: {
    shown: number;
    count: number;
    direction: ReadingDirection;
    onSeek: (index: number) => void;
    onDrag: (isDragged: boolean) => void;
    onFocusChange: (isFocused: boolean) => void;
  } = $props();

  function letGo(): void {
    onDrag(false);
  }

  function seekTo(page: number): void {
    onSeek(page - 1);
  }

  const chrome = getReaderChrome();
  const look = $derived(pageSliderLook(chrome.platform, chrome.width));
</script>

<svelte:window onpointerup={letGo} onpointercancel={letGo} />

<div dir={DIR_ATTRIBUTES[direction]} class="flex flex-1 min-inline-none">
  <ProgressSlider
    {look}
    value={shown + 1}
    min={1}
    max={count}
    step={1}
    dir={DIR_ATTRIBUTES[direction]}
    label={m.reader_slider()}
    valueText={m.reader_slider_value({ page: shown + 1, count })}
    inputClass="block-full android:block-touch-target desktop:expanded:block-pointer-minimum"
    onChange={seekTo}
    onCommit={letGo}
    onPointerDown={() => {
      onDrag(true);
    }}
    {onFocusChange}
  />
</div>
