<script lang="ts">
  import { resolve } from "$app/paths";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import PickableLink from "#lib/library/PickableLink.svelte";
  import SelectionMark from "#lib/library/SelectionMark.svelte";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import type { Selection } from "#lib/page/selection.svelte.ts";
  import { progressWords } from "#lib/series/book-reading.ts";
  import BookProgress from "#lib/series/BookProgress.svelte";

  import { bookWords, volumeWords } from "./book-number-words";
  import type { SectionTileLook } from "./section-tile";
  import type { PickKey } from "./section-tiles";

  let {
    book,
    cover,
    look,
    selection,
    marksPicks,
    order,
  }: {
    book: SeriesBook;
    cover: ShownCover;
    look: SectionTileLook;
    selection: Selection<PickKey> | undefined;
    marksPicks: boolean;
    order: () => readonly PickKey[];
  } = $props();

  const meta = $derived(
    [volumeWords(book), progressWords(book)]
      .filter((words) => words !== undefined)
      .join(" · "),
  );
  const isSelecting = $derived(selection?.isSelecting === true);
  const isPicked = $derived(selection?.has(book.id) === true);
</script>

<div data-pick-key={book.id}>
  <PickableLink
    id={book.id}
    href={resolve("/read/[book]", { book: book.id })}
    title={bookWords(book)}
    {selection}
    {order}
    data-book-link
    class={look.link}
  >
    <span class={[look.cover, isPicked && look.pickedCover]}>
      <CoverImage {cover} {coverUrl} />
      {#if isSelecting}
        {#if marksPicks}
          <SelectionMark isOn={isPicked} />
        {/if}
      {:else if book.reading.state === "read"}
        <span data-read-mark aria-hidden="true" class={look.readMark}>
          <Icon name="check" size={look.readCheckSize} />
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
