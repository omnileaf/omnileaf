<script lang="ts">
  import {
    ItemContent,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";

  import { bookSummary } from "./book-reading";
  import BookMarks from "./BookMarks.svelte";
  import BookProgress from "./BookProgress.svelte";

  let {
    book,
    progress,
    hasTwoLineTitle,
  }: {
    book: SeriesBook;
    progress: "beside" | "below";
    hasTwoLineTitle: boolean;
  } = $props();
</script>

<ItemContent class="gap-2xs min-inline-none">
  <span class="flex items-center gap-icon-gap min-inline-none">
    <ItemTitle
      class={[
        "min-inline-none",
        hasTwoLineTitle
          ? "line-clamp-2 wrap-break-word min-block-two-lines"
          : "truncate",
        book.reading.state === "read" && "text-muted",
      ]}
    >
      {book.title}
    </ItemTitle>
    <BookMarks {book} />
  </span>
  <ItemDescription class="truncate">{bookSummary(book)}</ItemDescription>
  {#if progress === "below"}
    <span class="mbs-xs flex block-progress-thin">
      <BookProgress
        {book}
        class="inline-native-book-progress max-inline-full"
      />
    </span>
  {/if}
</ItemContent>
{#if progress === "beside"}
  <BookProgress {book} class="shrink-0 inline-native-book-progress" />
{/if}
