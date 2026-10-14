<script lang="ts">
  import { ArrowLeft, ChevronLeft, Maximize } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { m } from "#lib/paraglide/messages.js";

  const BACK_ICON_SIZE = 24;
  const BACK_ICON_SIZE_WIDE = 20;
  const BAR_ICON_SIZE_WIDE = 19;

  let {
    seriesTitle,
    bookLine,
    onFullScreen,
    heading = $bindable(),
  }: {
    seriesTitle: string;
    bookLine: string;
    onFullScreen: () => void;
    heading?: HTMLHeadingElement | undefined;
  } = $props();
</script>

<div
  class="flex items-center gap-2xs rounded-reader-bar border border-reader-glass-edge bg-reader-glass p-xs shadow-reader-bar backdrop-blur-reader backdrop-saturate-140 expanded:gap-xs expanded:rounded-reader-bar-wide expanded:bg-reader-glass-wide expanded:px-reader-bar-inline-wide expanded:py-reader-bar-block-wide expanded:shadow-reader-bar-wide"
>
  <a
    href={resolve("/(app)")}
    title={m.reader_back_label()}
    class="relative flex shrink-0 items-center justify-center gap-xs rounded-full transition-control block-reader-control inline-reader-control hover:tint-reader-hover active:tint-reader-pressed expanded:rounded-reader-control-wide expanded:ps-reader-back-start-wide expanded:pe-md expanded:text-small expanded:font-semibold expanded:block-reader-control-wide expanded:inline-auto android:before:absolute android:before:block-touch-target android:before:inline-touch-target"
  >
    <ArrowLeft
      size={BACK_ICON_SIZE}
      aria-hidden="true"
      class="hidden android:max-expanded:block"
    />
    <ChevronLeft
      size={BACK_ICON_SIZE}
      aria-hidden="true"
      class="expanded:hidden android:max-expanded:hidden"
    />
    <ChevronLeft
      size={BACK_ICON_SIZE_WIDE}
      aria-hidden="true"
      class="hidden expanded:block"
    />
    <span class="sr-only expanded:hidden">{m.reader_back_label()}</span>
    <span class="max-expanded:hidden">{m.reader_back()}</span>
  </a>
  <span
    aria-hidden="true"
    class="shrink-0 bg-reader-line block-reader-divider inline-px max-expanded:hidden"
  ></span>
  <div
    class="flex flex-1 flex-col min-inline-none expanded:flex-row expanded:items-baseline expanded:gap-reader-dock-gap expanded:ps-reader-title-start-wide"
  >
    <h1
      bind:this={heading}
      tabindex="-1"
      class="truncate text-lead font-semibold expanded:shrink-0"
    >
      {seriesTitle}
    </h1>
    <p class="truncate text-caption text-reader-muted expanded:text-detail">
      {bookLine}
    </p>
  </div>
  <button
    type="button"
    aria-label={m.reader_full_screen()}
    title={m.reader_full_screen()}
    class="hidden shrink-0 items-center justify-center rounded-reader-control-wide transition-control block-reader-control-wide inline-reader-control-wide hover:tint-reader-hover active:tint-reader-pressed expanded:flex ios:hidden android:hidden"
    onclick={onFullScreen}
  >
    <Maximize size={BAR_ICON_SIZE_WIDE} aria-hidden="true" />
  </button>
</div>
