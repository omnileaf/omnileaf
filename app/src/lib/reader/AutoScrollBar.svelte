<script lang="ts">
  import { Minus, Pause, Play, Plus, X } from "@lucide/svelte";

  import { m } from "#lib/paraglide/messages.js";

  import type { AutoScrollSpeed } from "./auto-scroll.ts";
  import { autoScrollLook } from "./auto-scroll-look.ts";
  import { READER_ICON_SIZE } from "./reader-bar.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";

  let {
    speed,
    isPaused,
    isTouch,
    onToggle,
    onSlower,
    onFaster,
    onStop,
  }: {
    speed: AutoScrollSpeed;
    isPaused: boolean;
    isTouch: boolean;
    onToggle: () => void;
    onSlower: () => void;
    onFaster: () => void;
    onStop: () => void;
  } = $props();

  const titleId = $props.id();
  const chrome = getReaderChrome();
  const look = $derived(autoScrollLook(chrome.platform, chrome.width));
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

{#snippet toggle()}
  <button
    type="button"
    aria-label={isPaused
      ? m.reader_auto_scroll_play()
      : m.reader_auto_scroll_pause()}
    class={look.toggle}
    onclick={onToggle}
  >
    {#if isPaused}
      <ReaderIcon
        name="play"
        fallback={Play}
        isKit={look.hasKitIcons}
        size={READER_ICON_SIZE}
      />
    {:else}
      <ReaderIcon
        name="pause"
        fallback={Pause}
        isKit={look.hasKitIcons}
        size={READER_ICON_SIZE}
      />
    {/if}
  </button>
{/snippet}

<div class={look.place}>
  <section aria-labelledby={titleId} class={look.bar}>
    {#if look.leadsWithToggle}
      {@render toggle()}
    {/if}
    <div class={look.readout}>
      <h2 id={titleId} class="text-caption text-muted">
        {m.reader_auto_scroll()}
      </h2>
      <p class={look.state} aria-live="polite">{state}</p>
      {#if hint !== undefined}
        <p class="text-caption text-muted">{hint}</p>
      {/if}
    </div>
    {#if !look.leadsWithToggle}
      {@render toggle()}
    {/if}
    <div class={look.actions}>
      {#if !speed.isMyPace}
        <button
          type="button"
          aria-label={m.reader_auto_scroll_slower()}
          class={look.speedButton}
          onclick={onSlower}
        >
          <ReaderIcon
            name="minus"
            fallback={Minus}
            isKit={look.hasKitIcons}
            size={READER_ICON_SIZE}
          />
        </button>
        <button
          type="button"
          aria-label={m.reader_auto_scroll_faster()}
          class={look.speedButton}
          onclick={onFaster}
        >
          <ReaderIcon
            name="plus"
            fallback={Plus}
            isKit={look.hasKitIcons}
            size={READER_ICON_SIZE}
          />
        </button>
      {/if}
      <button
        type="button"
        aria-label={m.reader_auto_scroll_stop()}
        class={look.stopButton}
        onclick={onStop}
      >
        <ReaderIcon
          name="x"
          fallback={X}
          isKit={look.hasKitIcons}
          size={READER_ICON_SIZE}
        />
      </button>
    </div>
  </section>
</div>
