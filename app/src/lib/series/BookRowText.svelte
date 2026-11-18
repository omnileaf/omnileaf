<script lang="ts">
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import NotConnectedTag from "#lib/library/NotConnectedTag.svelte";

  import { bookSummary } from "./book-reading";
  import BookMarks from "./BookMarks.svelte";
  import BookProgress from "./BookProgress.svelte";

  let {
    book,
    isNotConnected = false,
  }: { book: SeriesBook; isNotConnected?: boolean } = $props();
</script>

<span class="flex flex-1 flex-col gap-xs py-icon-gap min-inline-none">
  <span class="flex items-center gap-icon-gap min-inline-none">
    <span
      class={[
        "truncate text-body font-medium",
        book.reading.state === "read" || isNotConnected
          ? "text-muted picked:text-foreground"
          : "text-foreground",
      ]}
    >
      {book.title}
    </span>
    <BookMarks {book} />
  </span>
  <span
    class="flex flex-wrap items-center gap-sm text-small text-muted picked:text-foreground"
  >
    {bookSummary(book)}
    {#if isNotConnected}
      <NotConnectedTag class="ms-auto" />
    {/if}
  </span>
  <BookProgress {book} />
</span>
