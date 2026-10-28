<script lang="ts">
  import { Check } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { PICKED_COVER_RING } from "#lib/library/cover-tile.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import PickableLink from "#lib/library/PickableLink.svelte";
  import SelectionMark from "#lib/library/SelectionMark.svelte";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import type { Selection } from "#lib/page/selection.svelte.ts";
  import { progressWords } from "#lib/series/book-reading.ts";
  import BookProgress from "#lib/series/BookProgress.svelte";

  import { bookWords, volumeWords } from "./book-number-words";
  import type { SectionTileLook } from "./section-tile";

  type BookId = SeriesBook["id"];

  const READ_MARK_ICON_SIZE = 14;

  let {
    book,
    cover,
    look,
    selection,
    order,
  }: {
    book: SeriesBook;
    cover: ShownCover;
    look: SectionTileLook;
    selection: Selection<BookId> | undefined;
    order: () => readonly BookId[];
  } = $props();

  const meta = $derived(
    [volumeWords(book), progressWords(book)]
      .filter((words) => words !== undefined)
      .join(" · "),
  );
  const isSelecting = $derived(selection?.isSelecting === true);
  const isPicked = $derived(selection?.has(book.id) === true);
</script>

<div data-book-id={book.id}>
  <PickableLink
    id={book.id}
    href={resolve("/read/[book]", { book: book.id })}
    title={bookWords(book)}
    {selection}
    {order}
    data-book-link
    class={look.link}
  >
    <span class={[look.cover, isPicked && PICKED_COVER_RING]}>
      <CoverImage {cover} {coverUrl} />
      {#if isSelecting}
        <SelectionMark isOn={isPicked} />
      {:else if book.reading.state === "read"}
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
  </PickableLink>
</div>
