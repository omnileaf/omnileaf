<script lang="ts">
  import type { SeriesBook } from "#lib/ipc/bindings.ts";

  import { bookSummary } from "./book-reading";
  import BookMarks from "./BookMarks.svelte";
  import BookProgress from "./BookProgress.svelte";

  let { book }: { book: SeriesBook } = $props();
</script>

<span class="flex flex-1 flex-col gap-xs py-icon-gap min-inline-none">
  <span class="flex items-center gap-icon-gap min-inline-none">
    <span
      class={[
        "truncate text-body font-medium",
        book.reading.state === "read"
          ? "text-muted picked:text-foreground"
          : "text-foreground",
      ]}
    >
      {book.title}
    </span>
    <BookMarks {book} />
  </span>
  <span class="text-small text-muted picked:text-foreground">
    {bookSummary(book)}
  </span>
  <BookProgress {book} />
</span>
