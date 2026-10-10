<script lang="ts">
  import type { BookPage } from "#lib/ipc/bindings.ts";
  import { omniUrl } from "#lib/omni/omni-url.ts";
  import { m } from "#lib/paraglide/messages.js";

  /** Pages either side of the one dragged to, the outermost shown on wide screens only, as the boards draw them. */
  const REACH = 3;
  const PHONE_REACH = 2;
  const PORTRAIT_RATIO = "2 / 3";

  let { pages, shown }: { pages: readonly BookPage[]; shown: number } =
    $props();

  const near = $derived(
    Array.from({ length: REACH * 2 + 1 }, (_, offset) => shown - REACH + offset)
      .filter((index) => index >= 0 && index < pages.length)
      .map((index) => ({ index, page: pages[index] })),
  );

  function ratioOf(page: BookPage | undefined): string {
    return page?.size == null
      ? PORTRAIT_RATIO
      : `${String(page.size.width)} / ${String(page.size.height)}`;
  }
</script>

<ol
  dir="ltr"
  aria-label={m.reader_nearby_pages()}
  class="flex items-end justify-center gap-reader-filmstrip-gap pbs-xs pbe-sm expanded:gap-reader-filmstrip-gap-wide"
>
  {#each near as { index, page } (index)}
    {@const isShown = index === shown}
    <li
      aria-current={isShown ? "page" : undefined}
      class={[
        "flex flex-col items-center gap-xs text-reader-thumbnail",
        isShown ? "font-bold text-on-reader" : "font-medium text-reader-muted",
        Math.abs(index - shown) > PHONE_REACH && "max-expanded:hidden",
      ]}
    >
      {#if page !== undefined}
        <img
          src={omniUrl(page.path)}
          alt={m.reader_page({ page: index + 1 })}
          decoding="async"
          draggable="false"
          style:aspect-ratio={ratioOf(page)}
          class={[
            "rounded-reader-thumbnail bg-reader-page object-cover inline-reader-thumbnail expanded:inline-reader-thumbnail-wide",
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
