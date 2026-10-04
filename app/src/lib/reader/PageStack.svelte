<script lang="ts">
  import { LoaderCircle } from "@lucide/svelte";
  import type { Attachment } from "svelte/attachments";
  import { SvelteSet } from "svelte/reactivity";

  import type { BookPage } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { fittedSize } from "#lib/reader/page-fit.ts";
  import { pagesAround } from "#lib/reader/page-window.ts";

  /** Pages decoded ahead of the one shown, enough that a turn rarely waits while the decoded pixels stay within a phone's means. */
  const PAGES_AHEAD = 3;
  /** How long a page may take before a spinner says it's on its way, so a quick one never flashes one. */
  const SPINNER_DELAY_MS = 100;
  const SPINNER_SIZE = 40;

  let { pages, shown }: { pages: readonly BookPage[]; shown: number } =
    $props();

  const decoded = new SvelteSet<number>();
  const failed = new SvelteSet<number>();
  let spaceWidth = $state(0);
  let spaceHeight = $state(0);
  let isSlow = $state(false);

  const kept = $derived(pagesAround(shown, pages.length, PAGES_AHEAD));
  const isShownReady = $derived(decoded.has(shown) || failed.has(shown));

  function sizeOf(page: BookPage) {
    return page.size === null
      ? undefined
      : fittedSize(page.size, { width: spaceWidth, height: spaceHeight });
  }

  /** Forgets how the page's last image fared, so an image mounted afresh shows only once it decodes and a failure clears once it loads. */
  function freshImage(index: number): Attachment<HTMLImageElement> {
    return () => {
      decoded.delete(index);
      failed.delete(index);
    };
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
  bind:clientWidth={spaceWidth}
  bind:clientHeight={spaceHeight}
  class="absolute inset-none overflow-hidden"
>
  {#each kept as index (index)}
    {@const page = pages[index]}
    {#if page !== undefined}
      {@const size = sizeOf(page)}
      {@const isShown = index === shown}
      <div
        class={[
          "absolute inset-none m-auto",
          size === undefined ? "block-full inline-full" : "reader-page-size",
          isShown ? "bg-reader-page" : "invisible",
        ]}
        style:--page-inline={size === undefined
          ? undefined
          : `${String(size.width)}px`}
        style:--page-block={size === undefined
          ? undefined
          : `${String(size.height)}px`}
      >
        <img
          {@attach freshImage(index)}
          src={omniUrl(page.path)}
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
            failed.add(index);
          }}
        />
      </div>
    {/if}
  {/each}
  <div
    role="status"
    class="pointer-events-none absolute inset-none flex items-center justify-center text-reader-muted"
  >
    {#if failed.has(shown)}
      <p class="px-xl text-center text-body">{m.reader_page_failed()}</p>
    {:else if isSlow}
      <LoaderCircle
        size={SPINNER_SIZE}
        aria-hidden="true"
        class="motion-safe:animate-spin"
      />
      <span class="sr-only">{m.reader_page_loading({ page: shown + 1 })}</span>
    {/if}
  </div>
</div>
