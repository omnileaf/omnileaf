<script lang="ts">
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { readingWords } from "./book-reading";

  let { book, dates }: { book: SeriesBook; dates: Intl.DateTimeFormat } =
    $props();

  const added = $derived(dates.format(book.addedAtMs));
</script>

<span
  class="flex flex-1 flex-col gap-2xs min-inline-none expanded:flex-row expanded:items-center expanded:gap-md"
>
  <span
    class={[
      "truncate text-lead expanded:flex-1 expanded:text-detail",
      book.reading.state === "read"
        ? "font-medium text-muted picked:text-foreground"
        : "font-bold text-foreground",
    ]}
  >
    {book.title}
  </span>
  <span class="text-caption text-muted expanded:hidden picked:text-foreground">
    {readingWords(book.reading, () => m.series_book_added({ date: added }))}
  </span>
  <span
    class="text-detail text-muted inline-series-column-added max-expanded:hidden picked:text-foreground"
  >
    <span class="sr-only">{m.series_book_added({ date: added })}</span>
    <span aria-hidden="true">{added}</span>
  </span>
  <span
    class="text-caption text-muted inline-series-column-progress max-expanded:hidden picked:text-foreground"
  >
    {readingWords(book.reading, m.series_book_unread)}
  </span>
</span>
