<script lang="ts">
  import type { PhonePlatform } from "#lib/page/platform.ts";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";

  import BookList from "./BookList.svelte";
  import {
    SwipeActionsSetting,
    setSwipeActionsSetting,
  } from "./swipe-actions.svelte.ts";

  let {
    phone,
    books,
    onNotConnected = () => undefined,
  }: {
    phone: PhonePlatform | undefined;
    books: readonly SeriesBook[];
    onNotConnected?: (book: SeriesBook) => void;
  } = $props();

  setSwipeActionsSetting(new SwipeActionsSetting(undefined));
  const selection = new Selection<SeriesBook["id"]>();
</script>

<main>
  <BookList
    {phone}
    {books}
    rows="books"
    seriesTitle="Sample Series 04"
    hasTwoLineTitles={false}
    isComplete
    onNearEnd={() => undefined}
    {selection}
    onStartPicking={() => undefined}
    onPickedNone={() => undefined}
    onMark={() => undefined}
    onSwiped={() => undefined}
    {onNotConnected}
  />
</main>
