<script lang="ts">
  import { type Snippet, untrack } from "svelte";

  import { getAnimationsSetting } from "#lib/appearance/animations.svelte.ts";
  import type { BookPage, PageCrop } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { sizeOfPage, type StripPlace } from "#lib/reader/cropped-pages.ts";
  import type { Size } from "#lib/reader/page-fit.ts";

  const UNSIZED_RATIO = "1 / 3";
  const SCREEN_SHARE = 0.8;
  const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

  let {
    pages,
    crop,
    shown,
    isBlank,
    marks,
    overlay,
    startAt,
    onShown,
    onShownReady,
  }: {
    pages: readonly BookPage[];
    crop: PageCrop;
    shown: number;
    isBlank: boolean;
    marks: readonly number[];
    overlay: Snippet;
    startAt: StripPlace | undefined;
    onShown: (index: number) => void;
    onShownReady: () => void;
  } = $props();

  const animations = getAnimationsSetting();
  const isCropped = $derived(crop !== "whole");
  let scroller: HTMLDivElement | undefined = $state();
  let spaceHeight = $state(0);
  let spaceWidth = $state(0);
  let placedWidth = 0;
  let lastPlace: StripPlace | undefined;
  let startingPlace = untrack(() => startAt);
  const pageElements: HTMLElement[] = [];
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a load sets its page's aspect ratio on the element itself, so the map only answers the template's next read and needs no reactivity
  const loadedSizes = new Map<string, Size>();
  let reported = -1;
  let isScrollPending = false;
  let unscrolled = 0;
  let progress = $state(0);
  let scrollRange = $state(0);
  let track: HTMLDivElement | undefined = $state();
  let isDragging = false;

  function measure(): void {
    if (scroller === undefined) {
      return;
    }
    scrollRange = scroller.scrollHeight - scroller.clientHeight;
    progress = scrollRange > 0 ? scroller.scrollTop / scrollRange : 0;
  }

  function markAt(index: number): number {
    const top = pageElements[index]?.offsetTop ?? 0;
    return scrollRange > 0 ? Math.min(1, top / scrollRange) : 0;
  }

  function dragTo(event: PointerEvent): void {
    if (scroller === undefined || track === undefined) {
      return;
    }
    const box = track.getBoundingClientRect();
    const along = Math.min(
      1,
      Math.max(0, (event.clientY - box.top) / box.height),
    );
    scroller.scrollTop =
      along * (scroller.scrollHeight - scroller.clientHeight);
  }

  function ratioOf(page: BookPage): string {
    const size = sizeOfPage(page, loadedSizes.get(page.path));
    return size === null
      ? UNSIZED_RATIO
      : `${String(size.width)} / ${String(size.height)}`;
  }

  function sizeToCroppedImage(
    image: HTMLImageElement,
    page: BookPage,
    index: number,
  ): void {
    const element = pageElements[index];
    if (crop === "whole" || scroller === undefined || element === undefined) {
      return;
    }
    loadedSizes.set(page.path, {
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    const before = element.offsetHeight;
    const shareAbove =
      before > 0
        ? Math.min(
            1,
            Math.max(0, (scroller.scrollTop - element.offsetTop) / before),
          )
        : 0;
    element.style.aspectRatio = ratioOf(page);
    if (shareAbove > 0) {
      scroller.scrollTop += (element.offsetHeight - before) * shareAbove;
    }
    measure();
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

  export function place(): StripPlace | undefined {
    if (scroller === undefined) {
      return undefined;
    }
    const page = pageAt(scroller.scrollTop);
    const element = pageElements[page];
    if (element === undefined || element.offsetHeight === 0) {
      return undefined;
    }
    return {
      kind: "strip",
      page,
      shareOfPage:
        (scroller.scrollTop - element.offsetTop) / element.offsetHeight,
    };
  }

  function scrollToPlace(target: StripPlace): void {
    const element = pageElements[target.page];
    if (scroller !== undefined && element !== undefined) {
      scroller.scrollTop =
        element.offsetTop + element.offsetHeight * target.shareOfPage;
    }
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
    if (isCropped && scroller?.clientWidth === placedWidth) {
      lastPlace = place();
    }
    measure();
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

  /** Scrolls down by `pixels`, carrying the fraction a frame can't move over to the next, false at the end of the strip. */
  export function scrollByPixels(pixels: number): boolean {
    if (scroller === undefined || isAtEnd(1, scroller)) {
      return false;
    }
    unscrolled += pixels;
    const whole = Math.trunc(unscrolled);
    if (whole > 0) {
      scroller.scrollTop += whole;
      unscrolled -= whole;
    }
    return true;
  }

  export function shownPageHeight(): number {
    return pageElements[reported]?.offsetHeight ?? 0;
  }

  $effect(() => {
    const target = shown;
    untrack(() => {
      if (target === reported || scroller === undefined) {
        return;
      }
      reported = target;
      if (startingPlace === undefined) {
        scroller.scrollTop = pageElements[target]?.offsetTop ?? 0;
      } else {
        scrollToPlace(startingPlace);
        startingPlace = undefined;
      }
    });
  });

  $effect(() => {
    const width = spaceWidth;
    untrack(() => {
      if (isCropped && lastPlace !== undefined && width !== placedWidth) {
        scrollToPlace(lastPlace);
      }
      placedWidth = width;
    });
  });

  $effect(() => {
    untrack(onShownReady);
  });

  $effect(() => {
    if (spaceHeight > 0) {
      untrack(measure);
    }
  });
</script>

<div
  bind:this={scroller}
  bind:clientHeight={spaceHeight}
  bind:clientWidth={spaceWidth}
  data-strip
  class={[
    "absolute inset-none grid overflow-y-auto overscroll-contain desktop:scrollbar-none",
    isCropped && "scroll-anchor-none",
  ]}
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
            onload={(event) => {
              if (event.currentTarget instanceof HTMLImageElement) {
                sizeToCroppedImage(event.currentTarget, page, index);
              }
            }}
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
<div
  bind:this={track}
  data-strip-rail
  aria-hidden="true"
  class="absolute inset-e-md inset-bs-strip-rail-inset inset-be-strip-rail-inset hidden cursor-pointer inline-strip-rail-width desktop:block"
  onpointerdown={(event) => {
    isDragging = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragTo(event);
  }}
  onpointermove={(event) => {
    if (isDragging) {
      dragTo(event);
    }
  }}
  onpointerup={() => {
    isDragging = false;
  }}
>
  <div
    class="absolute inset-none mx-auto rounded-full bg-reader-grey inline-strip-rail-track"
  ></div>
  {#each marks as index (index)}
    <span
      data-rail-tick
      class="absolute inset-x-none mx-auto bg-reader-muted block-px inline-strip-rail-tick"
      style:top="{markAt(index) * 100}%"
    ></span>
  {/each}
  <span
    data-rail-thumb
    class="absolute inset-x-none rounded-full bg-on-reader block-strip-rail-thumb"
    style:top="calc({progress} * (100% - var(--spacing-strip-rail-thumb)))"
  ></span>
</div>
