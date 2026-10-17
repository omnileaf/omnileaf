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
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import VirtualTable from "#lib/virtual-grid/VirtualTable.svelte";

  import BookMenu from "./BookMenu.svelte";
  import { progressWords } from "./book-reading";
  import BookMarks from "./BookMarks.svelte";
  import BookProgress from "./BookProgress.svelte";
  import type { Selection } from "#lib/page/selection.svelte.ts";

  type BookId = SeriesBook["id"];

  const COLUMNS = 6;

  let {
    books,
    dates,
    isComplete,
    onNearEnd,
    selection,
    isPickingAll,
    onPickAll,
    onClear,
    onMark,
    selectAllBox = $bindable(null),
  }: {
    books: readonly SeriesBook[];
    dates: Intl.DateTimeFormat;
    isComplete: boolean;
    onNearEnd: () => void;
    selection: Selection<BookId>;
    isPickingAll: boolean;
    onPickAll: () => void;
    onClear: () => void;
    onMark: (books: BookId[], mark: ReadMark) => void;
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

<Card class="relative overflow-hidden px-sm shadow-card-rest">
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
          <TableHead class="inline-series-column-pages">
            {m.series_column_pages()}
          </TableHead>
          <TableHead class="inline-series-column-progress">
            {m.series_column_progress()}
          </TableHead>
          <TableHead class="inline-series-row-actions">
            <span class="sr-only">{m.series_column_actions()}</span>
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
        <TableCell>
          <span class="flex items-center gap-icon-gap min-inline-none">
            <a
              href={resolve("/read/[book]", { book: book.id })}
              draggable="false"
              class={[
                "truncate",
                book.reading.state === "read" && !isPicked
                  ? "text-muted"
                  : "text-foreground",
              ]}
            >
              {book.title}
            </a>
            <BookMarks {book} />
          </span>
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
          class={["tabular-nums", isPicked ? "text-foreground" : "text-muted"]}
        >
          {book.pageCount ?? ""}
        </TableCell>
        <TableCell
          class={isPicked || book.reading.state === "started"
            ? "text-foreground"
            : "text-muted"}
        >
          <span class="flex flex-col gap-xs">
            <span
              class={book.reading.state === "started"
                ? "text-caption"
                : "text-small"}
            >
              {progressWords(book)}
            </span>
            <BookProgress {book} class="inline-full" />
          </span>
        </TableCell>
        <TableCell>
          <BookMenu
            {book}
            onMark={(mark: ReadMark) => {
              onMark([book.id], mark);
            }}
          />
        </TableCell>
      </TableRow>
    {/snippet}
  </VirtualTable>
</Card>
