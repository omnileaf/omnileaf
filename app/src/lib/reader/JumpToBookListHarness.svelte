<script lang="ts">
  import { untrack } from "svelte";

  import type { Platform, SeriesBook } from "#lib/ipc/bindings.ts";

  import JumpToBookList from "./JumpToBookList.svelte";
  import { ReaderChrome, setReaderChrome } from "./reader-chrome.svelte.ts";

  let { platform }: { platform: Platform } = $props();

  setReaderChrome(untrack(() => new ReaderChrome(platform)));

  function bookWith(
    position: number,
    reading: SeriesBook["reading"],
    isBookmarked: boolean,
  ): SeriesBook {
    return {
      id: `0190a3e4-0000-8000-8000-00000000000${String(position)}` as SeriesBook["id"],
      position,
      title: `Volume ${String(position)}`,
      cover: null,
      addedAtMs: 0,
      reading,
      pageCount: 188,
      isBookmarked,
      isNew: false,
      isFileMissing: false,
      kind: "volume",
      numbers: { first: position, last: position },
      volume: null,
      section: null,
    };
  }

  const started = bookWith(2, { state: "started", page: 14 }, false);
  const books = [
    bookWith(1, { state: "read" }, true),
    started,
    bookWith(3, { state: "notStarted" }, false),
  ];

  function nothing(): void {}
</script>

<JumpToBookList
  {books}
  current={started.id}
  currentPage={14}
  onClose={nothing}
/>
