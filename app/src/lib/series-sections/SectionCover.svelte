<script lang="ts">
  import { Check } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { progressWords } from "#lib/series/book-reading.ts";
  import BookProgress from "#lib/series/BookProgress.svelte";

  import { bookWords, volumeWords } from "./book-number-words";
  import type { SectionTileLook } from "./section-tile";

  const READ_MARK_ICON_SIZE = 14;

  let {
    book,
    cover,
    look,
  }: { book: SeriesBook; cover: ShownCover; look: SectionTileLook } = $props();

  const meta = $derived(
    [volumeWords(book), progressWords(book)]
      .filter((words) => words !== undefined)
      .join(" · "),
  );
</script>

<a
  href={resolve("/read/[book]", { book: book.id })}
  data-book-link
  class={look.link}
>
  <span class={look.cover}>
    <CoverImage {cover} {coverUrl} />
    {#if book.reading.state === "read"}
      <span data-read-mark aria-hidden="true" class={look.readMark}>
        <Check size={READ_MARK_ICON_SIZE} />
      </span>
    {/if}
  </span>
  <span aria-hidden="true" class="contents">
    <BookProgress {book} class="inline-full" />
  </span>
  <span class="flex flex-col min-inline-none">
    <span class={look.title}>{bookWords(book)}</span>
    <span class={look.meta}>{meta}</span>
  </span>
</a>
