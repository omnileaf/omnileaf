<script lang="ts">
  import { resolve } from "$app/paths";
  import { LongPress } from "#lib/components/long-press.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import BookRowText from "./BookRowText.svelte";
  import type { BookSelection } from "./book-selection.svelte";
  import BookSheet from "./BookSheet.svelte";

  type BookId = SeriesBook["id"];

  const LONG_PRESS_MS = 500;

  let {
    books,
    dates,
    isComplete,
    onNearEnd,
    selection,
    onStartPicking,
    onMark,
  }: {
    books: readonly SeriesBook[];
    dates: Intl.DateTimeFormat;
    isComplete: boolean;
    onNearEnd: () => void;
    selection: BookSelection<BookId>;
    onStartPicking: (book: SeriesBook) => void;
    onMark: (books: BookId[], mark: ReadMark) => void;
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
        "relative flex cursor-pointer items-center gap-md ps-md pe-md min-block-book-row",
        isPicked && "bg-selected-row",
      ]}
    >
      {#if isPicked}
        <span
          aria-hidden="true"
          class="absolute inset-s-none inset-bs-none inset-be-none bg-accent inline-selected-edge"
        ></span>
      {/if}
      <Checkbox
        bind:checked={
          () => isPicked,
          () => {
            selection.toggle(book.id);
          }
        }
        aria-label={m.series_select_book({ title: book.title })}
        class="rounded-series-check border-check-off block-series-check inline-series-check"
        onclick={(event: MouseEvent) => {
          pickRunOnShift(event, book);
        }}
      />
      <BookRowText {book} {dates} />
    </label>
  {:else}
    <div
      role="presentation"
      class="flex items-center gap-xs ps-md pe-2xs select-none min-block-book-row"
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
      <BookSheet
        {book}
        onMark={(mark: ReadMark) => {
          onMark([book.id], mark);
        }}
        onSelect={() => {
          onStartPicking(book);
        }}
      />
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

<Card class="overflow-hidden">
  <VirtualGrid
    items={books}
    key={(book: SeriesBook) => book.id}
    label={m.series_books_list()}
    {isComplete}
    {onNearEnd}
    class="grid-cols-1"
    itemClass="border-be border-border last:border-be-0"
    cell={row}
  />
</Card>
