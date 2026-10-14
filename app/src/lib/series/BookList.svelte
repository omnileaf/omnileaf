<script lang="ts">
  import { resolve } from "$app/paths";
  import { LongPress } from "#lib/components/long-press.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import BookRowText from "./BookRowText.svelte";
  import type { BookSelection } from "./book-selection.svelte";

  type BookId = SeriesBook["id"];

  const LONG_PRESS_MS = 500;

  let {
    books,
    dates,
    isComplete,
    onNearEnd,
    selection,
    onStartPicking,
  }: {
    books: readonly SeriesBook[];
    dates: Intl.DateTimeFormat;
    isComplete: boolean;
    onNearEnd: () => void;
    selection: BookSelection<BookId>;
    onStartPicking: (book: SeriesBook) => void;
  } = $props();

  const longPress = new LongPress(LONG_PRESS_MS);
  const ids = $derived(books.map((book) => book.id));

  function releasePress(): void {
    longPress.released();
  }

  $effect(() => releasePress);

  function pickRunOnShift(event: MouseEvent, book: SeriesBook): void {
    if (event.shiftKey) {
      event.preventDefault();
      selection.extendTo(book.id, ids);
    }
  }
</script>

{#snippet row(book: SeriesBook)}
  {@const isPicked = selection.has(book.id)}
  {#if selection.isSelecting}
    <label
      class={[
        "flex cursor-pointer items-center gap-md min-block-book-row max-medium:ps-page-start max-medium:pe-md medium:px-lg expanded:gap-md expanded:px-md expanded:min-block-book-row-wide",
        isPicked && "bg-selected-row",
      ]}
    >
      <Checkbox
        bind:checked={
          () => isPicked,
          () => {
            selection.toggle(book.id);
          }
        }
        aria-label={m.series_select_book({ title: book.title })}
        class="rounded-series-check border-check-off block-series-check inline-series-check expanded:rounded-series-check-wide expanded:block-series-check-wide expanded:inline-series-check-wide"
        onclick={(event: MouseEvent) => {
          pickRunOnShift(event, book);
        }}
      />
      <BookRowText {book} {dates} />
    </label>
  {:else}
    <div
      role="presentation"
      class="flex items-center gap-md select-none min-block-book-row max-medium:ps-page-start max-medium:pe-md medium:px-lg expanded:px-md expanded:min-block-book-row-wide"
      onpointerdown={(event) => {
        longPress.pressed(event, () => {
          onStartPicking(book);
        });
      }}
      onpointerup={releasePress}
      onpointercancel={releasePress}
      onpointerleave={releasePress}
      oncontextmenu={(event) => {
        event.preventDefault();
      }}
    >
      <a
        href={resolve("/read/[book]", { book: book.id })}
        draggable="false"
        class="flex flex-1 items-center self-stretch min-inline-none"
      >
        <BookRowText {book} {dates} />
      </a>
    </div>
  {/if}
{/snippet}

<svelte:window
  onpointerdowncapture={() => {
    longPress.pointerWentDown();
  }}
  onclickcapture={(event: MouseEvent) => {
    longPress.clicked(event);
  }}
/>

<div
  class="max-medium:-ms-page-start max-medium:-me-page-end medium:overflow-hidden medium:rounded-card medium:border medium:border-border medium:bg-card"
>
  <VirtualGrid
    items={books}
    key={(book: SeriesBook) => book.id}
    label={m.series_books_list()}
    {isComplete}
    {onNearEnd}
    class="grid-cols-1"
    itemClass="border-be border-border last:max-medium:border-be-0 medium:last:border-be-0"
    cell={row}
  />
</div>
