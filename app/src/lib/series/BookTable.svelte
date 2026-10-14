<script lang="ts">
  import { resolve } from "$app/paths";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Checkbox } from "#lib/components/ui/checkbox/index.ts";
  import {
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "#lib/components/ui/table/index.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import VirtualTable from "#lib/virtual-grid/VirtualTable.svelte";

  import { readingWords } from "./book-reading";
  import type { BookSelection } from "./book-selection.svelte";

  type BookId = SeriesBook["id"];

  const COLUMNS = 4;

  let {
    books,
    dates,
    isComplete,
    onNearEnd,
    selection,
    isPickingAll,
    onPickAll,
    onClear,
    selectAllBox = $bindable(null),
  }: {
    books: readonly SeriesBook[];
    dates: Intl.DateTimeFormat;
    isComplete: boolean;
    onNearEnd: () => void;
    selection: BookSelection<BookId>;
    isPickingAll: boolean;
    onPickAll: () => void;
    onClear: () => void;
    selectAllBox?: HTMLElement | null;
  } = $props();

  const ids = $derived(books.map((book) => book.id));
  const isAllPicked = $derived(isComplete && selection.hasAll(ids));

  function keepTextUnselectedOnShift(event: MouseEvent): void {
    if (event.shiftKey) {
      event.preventDefault();
    }
  }

  function pickRunOnShift(event: MouseEvent, book: SeriesBook): void {
    if (event.shiftKey) {
      event.preventDefault();
      selection.extendTo(book.id, ids);
    }
  }
</script>

<Card class="overflow-hidden">
  <VirtualTable
    items={books}
    key={(book: SeriesBook) => book.id}
    label={m.series_books_list()}
    columns={COLUMNS}
    {isComplete}
    {onNearEnd}
    class="table-fixed select-none"
  >
    {#snippet head()}
      <TableHeader>
        <tr aria-rowindex={1}>
          <TableHead class="inline-series-row-check">
            <Checkbox
              bind:ref={selectAllBox}
              checked={isAllPicked}
              indeterminate={selection.count > 0 && !isAllPicked}
              aria-label={m.series_select_all()}
              aria-busy={isPickingAll}
              onCheckedChange={() => {
                if (isAllPicked) {
                  onClear();
                } else {
                  onPickAll();
                }
              }}
            />
          </TableHead>
          <TableHead>{m.series_column_book()}</TableHead>
          <TableHead class="inline-series-column-added">
            {m.series_column_added()}
          </TableHead>
          <TableHead class="inline-series-column-progress">
            {m.series_column_progress()}
          </TableHead>
        </tr>
      </TableHeader>
    {/snippet}
    {#snippet row(book: SeriesBook, rowIndex: number)}
      {@const isPicked = selection.has(book.id)}
      {@const added = dates.format(book.addedAtMs)}
      <TableRow
        aria-rowindex={rowIndex}
        aria-selected={isPicked}
        class={[
          "block-book-row-wide",
          isPicked && "bg-selected-row hover:bg-selected-row",
        ]}
        onmousedown={keepTextUnselectedOnShift}
      >
        <TableCell class="relative">
          {#if isPicked}
            <span
              aria-hidden="true"
              class="absolute inset-s-none inset-bs-none inset-be-none bg-accent inline-selected-edge"
            ></span>
          {/if}
          <Checkbox
            checked={isPicked}
            aria-label={m.series_select_book({ title: book.title })}
            onCheckedChange={() => {
              selection.toggle(book.id);
            }}
            onclick={(event: MouseEvent) => {
              pickRunOnShift(event, book);
            }}
          />
        </TableCell>
        <TableCell class="truncate">
          <a
            href={resolve("/read/[book]", { book: book.id })}
            draggable="false"
            class={[
              book.reading.state === "read" ? "font-medium" : "font-bold",
              book.reading.state === "read" && !isPicked
                ? "text-muted"
                : "text-foreground",
            ]}
          >
            {book.title}
          </a>
        </TableCell>
        <TableCell
          class={[
            "whitespace-nowrap",
            isPicked ? "text-foreground" : "text-muted",
          ]}
        >
          <span class="sr-only">{m.series_book_added({ date: added })}</span>
          <span aria-hidden="true">{added}</span>
        </TableCell>
        <TableCell
          class={["text-caption", isPicked ? "text-foreground" : "text-muted"]}
        >
          {readingWords(book.reading, m.series_book_unread)}
        </TableCell>
      </TableRow>
    {/snippet}
  </VirtualTable>
</Card>
