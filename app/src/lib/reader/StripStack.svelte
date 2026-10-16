<script lang="ts">
  import { type Snippet, untrack } from "svelte";

  import { getAnimationsSetting } from "#lib/appearance/animations.svelte.ts";
  import type { BookPage } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  const UNSIZED_RATIO = "1 / 3";
  const SCREEN_SHARE = 0.8;
  const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

  let {
    pages,
    shown,
    isBlank,
    overlay,
    onShown,
    onShownReady,
  }: {
    pages: readonly BookPage[];
    shown: number;
    isBlank: boolean;
    overlay: Snippet;
    onShown: (index: number) => void;
    onShownReady: () => void;
  } = $props();

  const animations = getAnimationsSetting();
  let scroller: HTMLDivElement | undefined = $state();
  let spaceHeight = $state(0);
  const pageElements: HTMLElement[] = [];
  let reported = -1;
  let isScrollPending = false;

  function ratioOf(page: BookPage): string {
    return page.size === null
      ? UNSIZED_RATIO
      : `${String(page.size.width)} / ${String(page.size.height)}`;
  }

  function pageAt(line: number): number {
    let low = 0;
    let high = pageElements.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const top = pageElements[middle]?.offsetTop ?? 0;
      if (top <= line) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low;
  }

  function reportShown(): void {
    isScrollPending = false;
    if (scroller === undefined) {
      return;
    }
    const index = pageAt(scroller.scrollTop + scroller.clientHeight / 2);
    if (index !== reported) {
      reported = index;
      onShown(index);
    }
  }

  function onScroll(): void {
    if (!isScrollPending) {
      isScrollPending = true;
      requestAnimationFrame(reportShown);
    }
  }

  function isAtEnd(step: number, element: HTMLDivElement): boolean {
    return step > 0
      ? element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      : element.scrollTop <= 0;
  }

  /** Scrolls most of a screen down for a positive `step` or up for a negative one, false at that end of the strip. */
  export function scrollByScreen(step: number): boolean {
    if (scroller === undefined || isAtEnd(step, scroller)) {
      return false;
    }
    const isSmooth =
      animations.isOn("reader") && !window.matchMedia(REDUCED_MOTION).matches;
    scroller.scrollBy({
      top: step * scroller.clientHeight * SCREEN_SHARE,
      behavior: isSmooth ? "smooth" : "instant",
    });
    return true;
  }

  $effect(() => {
    const target = shown;
    untrack(() => {
      if (target === reported || scroller === undefined) {
        return;
      }
      reported = target;
      scroller.scrollTop = pageElements[target]?.offsetTop ?? 0;
    });
  });

  $effect(() => {
    untrack(onShownReady);
  });
</script>

<div
  bind:this={scroller}
  bind:clientHeight={spaceHeight}
  data-strip
  class="absolute inset-none grid overflow-y-auto overscroll-contain"
  onscroll={onScroll}
>
  <div
    class="col-start-1 row-start-1 mx-auto flex flex-col inline-full max-inline-reader-strip"
  >
    {#each pages as page, index (page.path)}
      <div
        bind:this={pageElements[index]}
        style:aspect-ratio={ratioOf(page)}
        class="relative inline-full"
      >
        {#if isBlank}
          <div
            role="img"
            aria-label={m.reader_blank_page({
              page: index + 1,
              count: pages.length,
            })}
            class="border-be-2 border-reader-black bg-reader-page block-full inline-full"
          ></div>
        {:else}
          <img
            src={omniUrl(page.path)}
            alt={m.reader_page({ page: index + 1 })}
            loading="lazy"
            decoding="async"
            draggable="false"
            class="block select-none block-full inline-full"
          />
        {/if}
      </div>
    {/each}
  </div>
  <div
    class="sticky inset-bs-none col-start-1 row-start-1 inline-full"
    style:height="{spaceHeight}px"
  >
    {@render overlay()}
  </div>
</div>
