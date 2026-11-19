<script lang="ts">
  import {
    ItemContent,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import NotConnectedTag from "#lib/library/NotConnectedTag.svelte";

  import { bookSummary } from "./book-reading";
  import BookMarks from "./BookMarks.svelte";
  import BookProgress from "./BookProgress.svelte";

  let {
    book,
    progress,
    hasTwoLineTitle,
    isNotConnected = false,
  }: {
    book: SeriesBook;
    progress: "beside" | "below";
    hasTwoLineTitle: boolean;
    isNotConnected?: boolean;
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
        (book.reading.state === "read" || isNotConnected) && "text-muted",
      ]}
    >
      {book.title}
    </ItemTitle>
    <BookMarks {book} />
  </span>
  {#if isNotConnected}
    <ItemDescription class="flex flex-wrap items-center gap-sm">
      <span class="truncate">{bookSummary(book)}</span>
      <NotConnectedTag class="ms-auto" />
    </ItemDescription>
  {:else}
    <ItemDescription class="truncate">{bookSummary(book)}</ItemDescription>
  {/if}
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
