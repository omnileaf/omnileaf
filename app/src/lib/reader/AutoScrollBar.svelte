<script lang="ts">
  import { Minus, Pause, Play, Plus } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { AutoScrollSpeed } from "./auto-scroll.ts";
  import {
    READER_BUTTON,
    READER_GLASS,
    READER_ICON_SIZE,
  } from "./reader-bar.ts";

  let {
    speed,
    isPaused,
    isTouch,
    onToggle,
    onSlower,
    onFaster,
  }: {
    speed: AutoScrollSpeed;
    isPaused: boolean;
    isTouch: boolean;
    onToggle: () => void;
    onSlower: () => void;
    onFaster: () => void;
  } = $props();

  const titleId = $props.id();
  const roundedSpeed = $derived(Math.round(speed.pagesPerMinute * 2) / 2);
  const state = $derived.by(() => {
    if (isPaused) {
      return m.reader_auto_scroll_paused();
    }
    return speed.isMyPace
      ? m.reader_auto_scroll_your_pace()
      : m.reader_pages_a_minute({ count: roundedSpeed });
  });
  const hint = $derived.by(() => {
    if (!isTouch) {
      return isPaused ? m.reader_space_resumes() : m.reader_space_pauses();
    }
    if (isPaused) {
      return m.reader_tap_play();
    }
    return speed.isMyPace
      ? m.reader_about_pages_a_minute({ count: roundedSpeed })
      : undefined;
  });
</script>

<section
  aria-labelledby={titleId}
  class={cn(
    READER_GLASS,
    "grid grid-cols-auto-scroll items-center gap-sm px-md py-sm",
  )}
>
  <div class="flex flex-col">
    <h2 id={titleId} class="text-caption text-muted">
      {m.reader_auto_scroll()}
    </h2>
    <p class="text-small font-semibold" aria-live="polite">{state}</p>
    {#if hint !== undefined}
      <p class="text-caption text-muted">{hint}</p>
    {/if}
  </div>
  <button
    type="button"
    aria-label={isPaused
      ? m.reader_auto_scroll_play()
      : m.reader_auto_scroll_pause()}
    class="flex items-center justify-center rounded-full bg-foreground text-background block-touch-target inline-touch-target focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    onclick={onToggle}
  >
    {#if isPaused}
      <Play size={READER_ICON_SIZE} aria-hidden="true" />
    {:else}
      <Pause size={READER_ICON_SIZE} aria-hidden="true" />
    {/if}
  </button>
  <div class="flex items-center justify-end gap-xs">
    {#if !speed.isMyPace}
      <button
        type="button"
        aria-label={m.reader_auto_scroll_slower()}
        class={READER_BUTTON}
        onclick={onSlower}
      >
        <Minus size={READER_ICON_SIZE} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={m.reader_auto_scroll_faster()}
        class={READER_BUTTON}
        onclick={onFaster}
      >
        <Plus size={READER_ICON_SIZE} aria-hidden="true" />
      </button>
    {/if}
  </div>
</section>
