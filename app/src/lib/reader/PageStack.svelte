<script lang="ts">
  import { ChevronRight, ImageOff, RefreshCw } from "@lucide/svelte";
  import { type Snippet, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";

  import {
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import { Spinner } from "#lib/components/ui/spinner/index.ts";
  import type { BookPage, PageCrop } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { sizeOfPage, type SpreadPlace } from "#lib/reader/cropped-pages.ts";

  import { fittedTo, type Size } from "#lib/reader/page-fit.ts";
  import type { PageFit } from "#lib/reader/reader-settings.svelte.ts";
  import { spreadAt, type Spread } from "#lib/reader/spreads.ts";
  import { cellsAround, type SpreadsInView } from "#lib/reader/page-cells.ts";
  import { pagesAround } from "#lib/reader/page-window.ts";

  /** Pages decoded ahead of the one shown, enough that a turn rarely waits while the decoded pixels stay within a phone's means. */
  const PAGES_AHEAD = 3;
  /** How long a page may take before a spinner says it's on its way, so a quick one never flashes one. */
  const SPINNER_DELAY_MS = 100;
  const SPINNER_SIZE = 20;
  const RESTING_ZOOM = 1;
  const PROBLEM_ICON_SIZE = 20;
  const BUTTON_ICON_SIZE = 16;
  /** Asks again for a page that failed once, as the core may have dropped its request for newer ones. */
  const RETRIES = 1;

  let {
    pages,
    crop,
    shown,
    spreads,
    isPastEnd,
    fit,
    zoom,
    isReversed,
    overlay,
    bookTitle,
    isBlank,
    slide,
    isSettling,
    startAt,
    onNextPage,
    onShownReady,
    onSettled,
  }: {
    pages: readonly BookPage[];
    crop: PageCrop;
    shown: number;
    spreads: readonly Spread[];
    isPastEnd: boolean;
    fit: PageFit;
    zoom: number;
    isReversed: boolean;
    overlay: Snippet;
    bookTitle: string;
    isBlank: boolean;
    slide: number;
    isSettling: boolean;
    startAt: SpreadPlace | undefined;
    onNextPage: () => void;
    onShownReady: () => void;
    onSettled: () => void;
  } = $props();

  let scroller: HTMLDivElement | undefined = $state();

  const decoded = new SvelteSet<number>();
  const failed = new SvelteSet<number>();
  const retries = new SvelteMap<number, number>();
  const croppedSizes = new SvelteMap<string, Size>();
  let spaceWidth = $state(0);
  let spaceHeight = $state(0);
  let isSlow = $state(false);
  let startingPlace = untrack(() => startAt);

  const shownSpread = $derived(spreadAt(spreads, shown));
  const spread = $derived(spreads[shownSpread] ?? [shown]);
  const position = $derived(isPastEnd ? spreads.length : shownSpread);
  const nextSide = $derived(isReversed ? -1 : 1);
  const revealed = $derived(position + turnsRevealed(slide));
  let inView: SpreadsInView = $state.raw(
    untrack(() => ({ at: position, low: position, high: position })),
  );
  const cells = $derived(
    cellsAround(spreads, inView, pagesAround(shown, pages.length, PAGES_AHEAD)),
  );

  $effect.pre(() => {
    const at = position;
    const low = Math.min(at, revealed);
    const high = Math.max(at, revealed);
    const isMoving = isSettling || slide !== 0;
    untrack(() => {
      inView = isMoving
        ? {
            at,
            low: Math.min(inView.low, low),
            high: Math.max(inView.high, high),
          }
        : { at, low, high };
    });
  });
  const isShownReady = $derived(
    isBlank || decoded.has(shown) || failed.has(shown),
  );
  const isShownFailed = $derived(failed.has(shown));
  const isSpreadSettled = $derived(
    isBlank || spread.every((index) => decoded.has(index) || failed.has(index)),
  );
  const id = $props.id();

  function ratioOf(index: number): number | undefined {
    const page = pages[index];
    const size =
      page === undefined ? null : sizeOfPage(page, croppedSizes.get(page.path));
    return size === null || size.height <= 0
      ? undefined
      : size.width / size.height;
  }

  function heightOfSpread(pagesShown: Spread): number | undefined {
    if (crop === "whole") {
      return undefined;
    }
    let width = 0;
    for (const index of pagesShown) {
      const ratio = ratioOf(index);
      if (ratio === undefined) {
        return undefined;
      }
      width += ratio;
    }
    return fittedTo(
      { width, height: 1 },
      { width: spaceWidth, height: spaceHeight },
      fit,
    ).height;
  }

  function sizeOf(index: number, pagesShown: Spread, scale: number) {
    const ratio = ratioOf(index);
    if (ratio === undefined) {
      return undefined;
    }
    const spreadHeight = heightOfSpread(pagesShown);
    return scaled(
      spreadHeight === undefined
        ? fittedTo(
            { width: ratio, height: 1 },
            { width: spaceWidth / pagesShown.length, height: spaceHeight },
            fit,
          )
        : { width: spreadHeight * ratio, height: spreadHeight },
      scale,
    );
  }

  function settleOnceStill(
    event: TransitionEvent & { currentTarget: HTMLElement },
  ): void {
    if (event.currentTarget.getAnimations().length === 0) {
      onSettled();
    }
  }

  function placeOf(offset: number): string | undefined {
    const across = offset * nextSide * spaceWidth + slide;
    return across === 0 && !isSettling ? undefined : `${String(across)}px 0`;
  }

  function scaled(size: { width: number; height: number }, scale: number) {
    return { width: size.width * scale, height: size.height * scale };
  }

  function turnsRevealed(across: number): number {
    if (across === 0 || spaceWidth <= 0) {
      return 0;
    }
    return (
      -Math.sign(across * nextSide) * Math.ceil(Math.abs(across) / spaceWidth)
    );
  }

  function isInView(offset: number): boolean {
    const index = position + offset;
    return index >= inView.low && index <= inView.high;
  }

  export function shiftInFlight(): number {
    const cell = scroller?.querySelector<HTMLElement>("[data-turns]");
    if (cell === null || cell === undefined) {
      return 0;
    }
    const [across = ""] = getComputedStyle(cell).translate.split(" ");
    const shift = Number.parseFloat(across);
    return Number.isNaN(shift)
      ? 0
      : shift - Number(cell.dataset.turns) * nextSide * spaceWidth;
  }

  /** Starts each spread at its top, since a page fitted to the width scrolls down. */
  function startAtTop(page: number): void {
    scroller?.scrollTo({ top: 0, left: 0 });
    scroller?.setAttribute("data-shown-page", String(page + 1));
  }

  $effect(() => {
    startAtTop(shown);
  });

  function rangeDown(element: HTMLElement): number {
    return element.scrollHeight - element.clientHeight;
  }

  function rangeAcross(element: HTMLElement): number {
    return element.scrollWidth - element.clientWidth;
  }

  function shareOf(offset: number, range: number): number {
    return range > 0 ? offset / range : 0;
  }

  export function place(): SpreadPlace | undefined {
    return scroller === undefined
      ? undefined
      : {
          kind: "spread",
          page: shown,
          shareDown: shareOf(scroller.scrollTop, rangeDown(scroller)),
          shareAcross: shareOf(scroller.scrollLeft, rangeAcross(scroller)),
        };
  }

  function resumePlace(): void {
    if (startingPlace?.page === shown && scroller !== undefined) {
      scroller.scrollTop = startingPlace.shareDown * rangeDown(scroller);
      scroller.scrollLeft = startingPlace.shareAcross * rangeAcross(scroller);
    }
    startingPlace = undefined;
  }

  /** Forgets how the page's last image fared, so an image mounted afresh shows only once it decodes and a failure clears once it loads. */
  function freshImage(index: number): Attachment<HTMLImageElement> {
    return () => {
      untrack(() => {
        decoded.delete(index);
        failed.delete(index);
        retries.delete(index);
      });
    };
  }

  /** The page's address, a fresh one for each retry so the webview asks the core again. */
  function sourceOf(page: BookPage, index: number): string {
    const retry = retries.get(index);
    const url = omniUrl(page.path);
    return retry === undefined ? url : `${url}?retry=${String(retry)}`;
  }

  function tryAgain(index: number): void {
    failed.delete(index);
    retries.set(index, (retries.get(index) ?? 0) + 1);
  }

  function onFailure(index: number): void {
    const tried = retries.get(index) ?? 0;
    if (tried < RETRIES) {
      retries.set(index, tried + 1);
    } else {
      failed.add(index);
    }
  }

  function sizeToCroppedImage(image: HTMLImageElement, page: BookPage): void {
    if (crop !== "whole") {
      croppedSizes.set(page.path, {
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    }
  }

  /** Marks the page ready only once its pixels are decoded, so turning to it never waits on a decode. */
  async function decode(image: HTMLImageElement, index: number): Promise<void> {
    try {
      await image.decode();
      decoded.add(index);
    } catch {
      failed.add(index);
    }
  }

  $effect(() => {
    if (isSpreadSettled) {
      untrack(resumePlace);
    }
  });

  $effect(() => {
    if (isShownReady) {
      untrack(onShownReady);
      isSlow = false;
      return;
    }
    const waiting = setTimeout(() => {
      isSlow = true;
    }, SPINNER_DELAY_MS);
    return () => {
      clearTimeout(waiting);
    };
  });
</script>

<div class="absolute inset-none contain-paint">
  <div
    bind:this={scroller}
    bind:clientWidth={spaceWidth}
    bind:clientHeight={spaceHeight}
    class={[
      "absolute inset-none grid",
      fit === "screen" && zoom === 1
        ? "overflow-hidden"
        : "overflow-auto overscroll-contain",
    ]}
  >
    {#each cells as cell (cell.spread[0])}
      {@const isNeighbour = cell.offset !== 0}
      {@const isPainted = isInView(cell.offset)}
      <div
        aria-hidden={isNeighbour ? "true" : undefined}
        data-turns={isPainted ? cell.offset : undefined}
        class={[
          "flex",
          isNeighbour
            ? "fixed inset-s-none inset-bs-none overflow-hidden"
            : "col-start-1 row-start-1",
          !isPainted && "invisible",
          isReversed && "flex-row-reverse",
          isSettling &&
            isPainted &&
            "motion-reader:transition-transform motion-reader:duration-slide motion-reader:ease-emphasized",
        ]}
        style:translate={placeOf(cell.offset)}
        style:min-width="{spaceWidth}px"
        style:min-height="{spaceHeight}px"
        style:width={isNeighbour ? `${String(spaceWidth)}px` : undefined}
        style:height={isNeighbour ? `${String(spaceHeight)}px` : undefined}
        ontransitionend={settleOnceStill}
        ontransitioncancel={settleOnceStill}
      >
        {#each cell.spread as index (index)}
          {@const page = pages[index]}
          {#if page !== undefined}
            {@const size = sizeOf(
              index,
              cell.spread,
              isNeighbour ? RESTING_ZOOM : zoom,
            )}
            {@const isShown = spread.includes(index)}
            <div
              class={[
                "relative my-auto shrink-0",
                isReversed
                  ? "first:me-auto last:ms-auto"
                  : "first:ms-auto last:me-auto",
                decoded.has(index) && "bg-reader-page",
                size === undefined
                  ? "block-full inline-full"
                  : "reader-page-size",
              ]}
              style:--page-inline={size === undefined
                ? undefined
                : `${String(size.width)}px`}
              style:--page-block={size === undefined
                ? undefined
                : `${String(size.height)}px`}
            >
              {#if isBlank}
                <div
                  role="img"
                  aria-label={m.reader_page({ page: index + 1 })}
                  aria-hidden={isShown ? undefined : "true"}
                  class="flex items-center justify-center bg-reader-grey text-body font-semibold text-on-reader block-full inline-full"
                >
                  <span aria-hidden="true">
                    {m.reader_blank_page({
                      page: index + 1,
                      count: pages.length,
                    })}
                  </span>
                </div>
              {:else}
                <img
                  {@attach freshImage(index)}
                  src={sourceOf(page, index)}
                  alt={m.reader_page({ page: index + 1 })}
                  aria-hidden={isShown ? undefined : "true"}
                  decoding="async"
                  draggable="false"
                  class={[
                    "object-contain select-none block-full inline-full",
                    !decoded.has(index) && "invisible",
                  ]}
                  onload={(event) => {
                    if (event.currentTarget instanceof HTMLImageElement) {
                      sizeToCroppedImage(event.currentTarget, page);
                      void decode(event.currentTarget, index);
                    }
                  }}
                  onerror={() => {
                    onFailure(index);
                  }}
                />
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/each}
    <div
      class="sticky inset-s-none inset-bs-none col-start-1 row-start-1"
      style:width="{spaceWidth}px"
      style:height="{spaceHeight}px"
    >
      {@render overlay()}
      <svelte:element
        this={isShownFailed ? "section" : "div"}
        aria-labelledby={isShownFailed ? `${id}-problem` : undefined}
        class="pointer-events-none absolute inset-none flex flex-col items-center justify-center gap-lg px-xl"
      >
        <div
          role="status"
          class="flex flex-col items-center gap-sm text-center max-inline-page-problem"
        >
          {#if isShownFailed}
            <EmptyMedia>
              <ImageOff size={PROBLEM_ICON_SIZE} aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle
              id="{id}-problem"
              class="text-group-title font-semibold expanded:text-body"
            >
              {m.reader_page_failed()}
            </EmptyTitle>
            <EmptyDescription class="text-small">
              {m.reader_page_failed_body({
                page: shown + 1,
                title: bookTitle,
              })}
            </EmptyDescription>
          {:else if isSlow}
            <Spinner size={SPINNER_SIZE} class="text-muted" />
            <p class="text-small text-muted">
              {m.reader_page_loading({ page: shown + 1 })}
            </p>
          {/if}
        </div>
        {#if isShownFailed}
          <div class="pointer-events-auto flex flex-wrap justify-center gap-sm">
            <button
              type="button"
              class="flex items-center gap-sm rounded-shadcn-button border border-border bg-card px-lg text-body font-medium transition-control min-block-touch-target hover:bg-hover active:bg-pressed expanded:text-small expanded:min-block-pointer-button"
              onclick={() => {
                tryAgain(shown);
              }}
            >
              <RefreshCw size={BUTTON_ICON_SIZE} aria-hidden="true" />
              {m.reader_try_again()}
            </button>
            <button
              type="button"
              class="flex items-center gap-sm rounded-shadcn-button bg-accent px-lg text-body font-medium text-on-accent transition-control min-block-touch-target hover:bg-accent-hover active:bg-accent-pressed expanded:text-small expanded:min-block-pointer-button"
              onclick={onNextPage}
            >
              {m.reader_next_page()}
              <ChevronRight
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="rtl:-scale-x-100"
              />
            </button>
          </div>
        {/if}
      </svelte:element>
    </div>
  </div>
</div>
