<script lang="ts">
  import { Minus, Pause, Play, Plus, X } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { AutoScrollSpeed } from "./auto-scroll.ts";
  import { autoScrollLook } from "./auto-scroll-look.ts";
  import { READER_ICON_SIZE } from "./reader-bar.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import { ReaderControls } from "./reader-controls.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";

  let {
    speed,
    isPaused,
    isTouch,
    onToggle,
    onSlower,
    onFaster,
    onStop,
    onReturnFocus,
  }: {
    speed: AutoScrollSpeed;
    isPaused: boolean;
    isTouch: boolean;
    onToggle: () => void;
    onSlower: () => void;
    onFaster: () => void;
    onStop: () => void;
    onReturnFocus: () => void;
  } = $props();

  const TUCK_AFTER_MS = 3000;
  const titleId = $props.id();
  const chrome = getReaderChrome();
  const look = $derived(autoScrollLook(chrome.platform, chrome.width));
  const toolbar = new ReaderControls(TUCK_AFTER_MS);
  const tucks = $derived(look.tucked !== null);
  const isTucked = $derived(tucks && !isPaused && !toolbar.isShown);
  let section: HTMLElement | undefined = $state();

  $effect(() => {
    if (!tucks) {
      return;
    }
    if (isPaused) {
      toolbar.stop();
    } else {
      toolbar.show();
    }
  });

  $effect(() => {
    if (isTucked && section?.contains(document.activeElement) === true) {
      onReturnFocus();
    }
  });

  $effect(() => () => {
    toolbar.stop();
  });

  function letGoOfTappedButton(event: MouseEvent): void {
    const tapped =
      event.target instanceof Element ? event.target.closest("button") : null;
    if (event.detail > 0 && tapped !== null) {
      tapped.blur();
    }
  }

  const tuckEvents = $derived(
    tucks
      ? {
          onpointerdown: () => {
            toolbar.show();
          },
          onfocusin: () => {
            toolbar.focused();
          },
          onclick: letGoOfTappedButton,
          onfocusout: () => {
            toolbar.blurred();
          },
          onkeydown: () => {
            toolbar.focused();
          },
        }
      : {},
  );

  const roundedSpeed = $derived(Math.round(speed.pagesPerMinute * 2) / 2);
  const status = $derived.by(() => {
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

<div class={cn(look.place, isTucked && look.tucked)}>
  <section
    bind:this={section}
    aria-labelledby={titleId}
    class={look.bar}
    {...tuckEvents}
  >
    {#if look.leadsWithToggle}
      {@render toggle()}
    {/if}
    <div class={look.readout}>
      <h2 id={titleId} class="text-caption text-muted">
        {m.reader_auto_scroll()}
      </h2>
      <p class={look.state}>{status}</p>
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
<p class="sr-only" aria-live="polite">{status}</p>
