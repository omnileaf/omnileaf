<script lang="ts">
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { Notices, setNotices } from "#lib/notices/notices.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";

  import SeriesBooks from "./SeriesBooks.svelte";
  import {
    SwipeActionsSetting,
    setSwipeActionsSetting,
  } from "./swipe-actions.svelte.ts";

  let {
    platform,
    books,
  }: { platform: Platform; books: readonly SeriesBook[] } = $props();

  setNotices(new Notices());
  setSwipeActionsSetting(new SwipeActionsSetting(undefined));
</script>

<main>
  <SeriesBooks
    {books}
    seriesTitle="Sample Series 04"
    bookCount={8}
    readCount={2}
    bookmarkCount={2}
    listing={{ shown: "all", direction: "ascending" }}
    onListing={() => undefined}
    isComplete
    onNearEnd={() => undefined}
    onLoadAll={() => Promise.resolve()}
    onMark={() => Promise.resolve(true)}
    onBookmark={() => Promise.resolve({ newlyBookmarked: 0, failed: false })}
    onRemoveBookmarks={() => Promise.resolve(true)}
    onRemove={() => Promise.resolve(undefined)}
    onShowInFolder={() => undefined}
    {platform}
  />
</main>
