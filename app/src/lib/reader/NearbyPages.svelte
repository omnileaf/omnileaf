<script lang="ts">
  import type { BookPage } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { previewWindow } from "./preview-window.ts";

  const WIDE_REACH = { before: 3, after: 7 };
  const PHONE_REACH = { before: 1, after: 4 };
  const PORTRAIT_RATIO = "2 / 3";

  let {
    pages,
    shown,
    isBlank,
    isReversed,
  }: {
    pages: readonly BookPage[];
    shown: number;
    isBlank: boolean;
    isReversed: boolean;
  } = $props();

  const wide = $derived(previewWindow(shown, pages.length, WIDE_REACH));
  const phone = $derived(previewWindow(shown, pages.length, PHONE_REACH));
  const near = $derived(
    Array.from(
      { length: wide.last - wide.first + 1 },
      (_, offset) => wide.first + offset,
    ).map((index) => ({ index, page: pages[index] })),
  );

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
        "flex flex-1 flex-col items-center gap-xs text-reader-thumbnail max-inline-reader-thumbnail-wide min-inline-none",
        isShown ? "font-bold text-on-reader" : "font-medium text-reader-muted",
        (index < phone.first || index > phone.last) && "max-expanded:hidden",
      ]}
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
          src={omniUrl(page.thumbnail)}
          alt={m.reader_page({ page: index + 1 })}
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
    </li>
  {/each}
</ol>
