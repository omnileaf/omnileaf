<script lang="ts">
  import { onDestroy, untrack } from "svelte";

  import type { BookPage } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { AskedImages } from "./asked-images.svelte.ts";
  import { thumbnailLoads } from "./image-loads.svelte.ts";
  import { pagesByUrgency } from "./page-requests.ts";
  import { previewWindow } from "./preview-window.ts";
  import { ThumbRest } from "./thumb-rest.svelte.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import {
    WINDOWS_CURRENT_PAGE_INK,
    WINDOWS_OTHER_PAGE_INK,
  } from "./windows-reader-bar.ts";

  const WIDE_REACH = { before: 3, after: 7 };
  const PHONE_REACH = { before: 1, after: 4 };
  const PORTRAIT_RATIO = "2 / 3";

  let {
    pages,
    shown,
    isBlank,
    isReversed,
    isSliderHeld,
    onPick,
  }: {
    pages: readonly BookPage[];
    shown: number;
    isBlank: boolean;
    isReversed: boolean;
    isSliderHeld: boolean;
    onPick: (index: number) => void;
  } = $props();

  const chrome = getReaderChrome();
  const currentInk = $derived(
    chrome.isCommandBar ? WINDOWS_CURRENT_PAGE_INK : "font-bold text-on-reader",
  );
  const otherInk = $derived(
    chrome.isCommandBar
      ? WINDOWS_OTHER_PAGE_INK
      : "font-medium text-reader-muted",
  );
  const wide = $derived(previewWindow(shown, pages.length, WIDE_REACH));
  const phone = $derived(previewWindow(shown, pages.length, PHONE_REACH));
  const shownAtThisWidth = $derived(chrome.width === "expanded" ? wide : phone);
  const near = $derived(
    Array.from(
      { length: wide.last - wide.first + 1 },
      (_, offset) => wide.first + offset,
    ).map((index) => ({ index, page: pages[index] })),
  );

  const asked = new AskedImages(thumbnailLoads);
  const thumb = new ThumbRest();
  const wanted = $derived(thumbnailsWanted());

  function thumbnailsWanted(): readonly number[] {
    if (isSliderHeld && thumb.restingOn !== shown) {
      return [];
    }
    return pagesByUrgency(
      near
        .filter(
          ({ index }) =>
            index >= shownAtThisWidth.first && index <= shownAtThisWidth.last,
        )
        .map(({ index }) => ({ spread: [index], offset: index - shown })),
      "forward",
    );
  }

  $effect(() => {
    const heldOn = isSliderHeld ? shown : undefined;
    untrack(() => {
      thumb.heldOn(heldOn);
    });
  });

  $effect(() => {
    asked.askFor(wanted);
  });

  onDestroy(() => {
    thumb.letGo();
  });

  function ratioOf(page: BookPage | undefined): string {
    return page?.size == null
      ? PORTRAIT_RATIO
      : `${String(page.size.width)} / ${String(page.size.height)}`;
  }
</script>

<ol
  dir={isReversed ? "rtl" : "ltr"}
  aria-label={m.reader_nearby_pages()}
  class="flex items-end justify-center gap-reader-filmstrip-gap pbs-xs pbe-sm expanded:gap-reader-filmstrip-gap-wide"
>
  {#each near as { index, page } (index)}
    {@const isShown = index === shown}
    <li
      aria-current={isShown ? "page" : undefined}
      class={[
        "flex flex-1 text-reader-thumbnail max-inline-reader-thumbnail-wide min-inline-none",
        isShown ? currentInk : otherInk,
        (index < phone.first || index > phone.last) && "max-expanded:hidden",
      ]}
    >
      <button
        type="button"
        aria-label={m.reader_page({ page: index + 1 })}
        class="flex flex-col items-center gap-xs inline-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onclick={() => {
          onPick(index);
        }}
      >
        {#if page !== undefined && isBlank}
          <span
            aria-hidden="true"
            style:aspect-ratio={ratioOf(page)}
            class={[
              "rounded-reader-thumbnail bg-reader-grey inline-full",
              isShown
                ? "outline-2 outline-offset-2 outline-reader-accent"
                : "opacity-70",
            ]}
          ></span>
        {:else if page !== undefined}
          <img
            {@attach asked.freshImage(index)}
            {@attach asked.loadWhenAsked(index, omniUrl(page.thumbnail))}
            alt=""
            decoding="async"
            draggable="false"
            style:aspect-ratio={ratioOf(page)}
            class={[
              "rounded-reader-thumbnail bg-reader-page object-cover inline-full",
              isShown
                ? "outline-2 outline-offset-2 outline-reader-accent"
                : "opacity-70",
            ]}
          />
        {/if}
        <span aria-hidden="true">{index + 1}</span>
      </button>
    </li>
  {/each}
</ol>
