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
  import type { BookPage } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { fittedTo } from "#lib/reader/page-fit.ts";
  import type { PageFit } from "#lib/reader/reader-settings.svelte.ts";
  import type { Spread } from "#lib/reader/spreads.ts";
  import { pagesAround } from "#lib/reader/page-window.ts";

  /** Pages decoded ahead of the one shown, enough that a turn rarely waits while the decoded pixels stay within a phone's means. */
  const PAGES_AHEAD = 3;
  /** How long a page may take before a spinner says it's on its way, so a quick one never flashes one. */
  const SPINNER_DELAY_MS = 100;
  const SPINNER_SIZE = 20;
  const PROBLEM_ICON_SIZE = 20;
  const BUTTON_ICON_SIZE = 16;
  /** Asks again for a page that failed once, as the core may have dropped its request for newer ones. */
  const RETRIES = 1;

  let {
    pages,
    shown,
    spread,
    fit,
    zoom,
    isReversed,
    overlay,
    bookTitle,
    isBlank,
    slide,
    isSettling,
    onNextPage,
    onShownReady,
  }: {
    pages: readonly BookPage[];
    shown: number;
    spread: Spread;
    fit: PageFit;
    zoom: number;
    isReversed: boolean;
    overlay: Snippet;
    bookTitle: string;
    isBlank: boolean;
    slide: number;
    isSettling: boolean;
    onNextPage: () => void;
    onShownReady: () => void;
  } = $props();

  let scroller: HTMLDivElement | undefined = $state();

  const decoded = new SvelteSet<number>();
  const failed = new SvelteSet<number>();
  const retries = new SvelteMap<number, number>();
  let spaceWidth = $state(0);
  let spaceHeight = $state(0);
  let isSlow = $state(false);

  const kept = $derived(pagesAround(shown, pages.length, PAGES_AHEAD));
  const isShownReady = $derived(
    isBlank || decoded.has(shown) || failed.has(shown),
  );
  const isShownFailed = $derived(failed.has(shown));
  const id = $props.id();

  function sizeOf(page: BookPage) {
    return page.size === null
      ? undefined
      : zoomed(
          fittedTo(
            page.size,
            { width: spaceWidth / spread.length, height: spaceHeight },
            fit,
          ),
        );
  }

  function zoomed(size: { width: number; height: number }) {
    return { width: size.width * zoom, height: size.height * zoom };
  }

  /** Starts each spread at its top, since a page fitted to the width scrolls down. */
  function startAtTop(page: number): void {
    scroller?.scrollTo({ top: 0, left: 0 });
    scroller?.setAttribute("data-shown-page", String(page + 1));
  }

  $effect(() => {
    startAtTop(shown);
  });

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
  <div
    class={[
      "col-start-1 row-start-1 flex items-center justify-center",
      isReversed && "flex-row-reverse",
      isSettling &&
        "motion-reader:transition-transform motion-reader:duration-slide motion-reader:ease-emphasized",
    ]}
    style:translate={slide !== 0 || isSettling
      ? `${String(slide)}px 0`
      : undefined}
    style:min-width="{spaceWidth}px"
    style:min-height="{spaceHeight}px"
  >
    {#each kept as index (index)}
      {@const page = pages[index]}
      {#if page !== undefined}
        {@const size = sizeOf(page)}
        {@const isShown = spread.includes(index)}
        <div
          class={[
            isShown ? "relative shrink-0" : "invisible absolute inset-none",
            isShown && decoded.has(index) && "bg-reader-page",
            isShown &&
              (size === undefined
                ? "block-full inline-full"
                : "reader-page-size"),
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
                {m.reader_blank_page({ page: index + 1, count: pages.length })}
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
            >{m.reader_page_failed()}</EmptyTitle
          >
          <EmptyDescription class="text-small"
            >{m.reader_page_failed_body({
              page: shown + 1,
              title: bookTitle,
            })}</EmptyDescription
          >
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
