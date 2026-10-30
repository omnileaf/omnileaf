<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { on } from "svelte/events";
  import { Clock, Play } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import type { BookPage, SeriesNeighbour } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import BookStepLink from "#lib/reader/BookStepLink.svelte";
  import NearbyPages from "#lib/reader/NearbyPages.svelte";
  import PageSlider from "#lib/reader/PageSlider.svelte";
  import type { ReadingDirection } from "#lib/reader/reading-direction.svelte.ts";

  import {
    EDGE_TO_EDGE_BARS,
    READER_CAPSULE,
    READER_GLASS,
    READER_ICON_SIZE,
    readerButton,
  } from "./reader-bar.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";
  import { type Spread, spreadPosition } from "./spreads.ts";
  import { WINDOWS_BOTTOM_BAR } from "./windows-reader-bar.ts";

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
    isShown,
    onPlay,
    onSeek,
  }: {
    pages: readonly BookPage[];
    shown: number;
    spread: Spread;
    previous: SeriesNeighbour | null;
    next: SeriesNeighbour | null;
    direction: ReadingDirection;
    quickSettings: Snippet | undefined;
    secondsLeft: number | undefined;
    isBlank: boolean;
    showsPreviews: boolean;
    isShown: boolean;
    onPlay: (() => void) | undefined;
    onSeek: (index: number) => void;
  } = $props();

  const count = $derived(pages.length);
  const chrome = getReaderChrome();
  const floats = $derived(chrome.floats);
  let isDragged = $state(false);
  let isSliderFocused = $state(false);
  let isHovered = $state(false);
  let staysUp = $state(false);
  const isPreviewing = $derived(
    showsPreviews && (isDragged || isSliderFocused || isHovered || staysUp),
  );

  const tracksMouse: Attachment<HTMLElement> = (element) => {
    const stopEntering = on(element, "pointerenter", (event) => {
      isHovered = event.pointerType === "mouse";
    });
    const stopLeaving = on(element, "pointerleave", () => {
      isHovered = false;
    });
    return () => {
      stopEntering();
      stopLeaving();
    };
  };

  $effect(() => {
    if (!isShown) {
      staysUp = false;
      isHovered = false;
    }
  });
</script>

<div
  class={floats
    ? cn(
        "flex flex-col items-center gap-sm",
        isShown && "*:pointer-events-auto",
      )
    : chrome.isCommandBar
      ? WINDOWS_BOTTOM_BAR
      : cn(
          "flex flex-col gap-sm",
          chrome.spans
            ? [EDGE_TO_EDGE_BARS, "px-lg pbs-sm pbe-native-reader-bar-end"]
            : [
                READER_GLASS,
                "p-sm expanded:justify-center expanded:min-block-reader-top-wide large:py-none",
              ],
        )}
  {@attach tracksMouse}
>
  {#if isPreviewing && floats}
    <div
      class={cn(
        READER_CAPSULE,
        "flex-col items-stretch self-stretch rounded-reader-glass",
      )}
    >
      <NearbyPages
        {pages}
        {shown}
        {isBlank}
        isReversed={direction === "rightToLeft"}
        onPick={onSeek}
      />
    </div>
  {:else if isPreviewing}
    <NearbyPages
      {pages}
      {shown}
      {isBlank}
      isReversed={direction === "rightToLeft"}
      onPick={onSeek}
    />
  {/if}
  {#if quickSettings !== undefined}
    <div
      role="group"
      aria-label={m.reader_quick_settings()}
      class={floats
        ? cn(READER_CAPSULE, "flex-wrap justify-center px-2xs max-inline-full")
        : chrome.isCommandBar
          ? "flex flex-wrap items-center justify-center gap-2xs large:hidden"
          : "flex flex-wrap items-stretch rounded-shadcn-control shadow-raised large:hidden"}
    >
      {@render quickSettings()}
    </div>
  {/if}
  <div
    role={floats ? "group" : undefined}
    aria-label={floats ? m.reader_pages_title() : undefined}
    dir="ltr"
    class={floats
      ? cn(READER_CAPSULE, "gap-2xs self-stretch px-2xs")
      : cn(
          "flex items-center gap-xs expanded:gap-sm",
          chrome.isOnPhone && "gap-sm",
        )}
  >
    <BookStepLink step="previous" neighbour={previous} />
    {#if onPlay !== undefined}
      <button
        type="button"
        aria-label={m.reader_start_auto_scroll()}
        class={readerButton(chrome.platform, chrome.width)}
        onclick={onPlay}
      >
        <ReaderIcon
          name="play"
          fallback={Play}
          isKit={chrome.isOnPhone}
          size={READER_ICON_SIZE}
        />
      </button>
    {/if}
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
        staysUp ||= dragged;
      }}
      onFocusChange={(isFocused: boolean) => {
        isSliderFocused = isFocused;
      }}
    />
    <BookStepLink step="next" neighbour={next} />
  </div>
  {#if secondsLeft !== undefined}
    <p
      class={cn(
        "flex items-center justify-center gap-xs text-caption text-reader-muted",
        floats && [READER_CAPSULE, "px-md py-2xs"],
      )}
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
