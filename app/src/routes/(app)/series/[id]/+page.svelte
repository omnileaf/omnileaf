<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";

  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    commands,
    type ReadMark,
    type SeriesBook,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { m } from "#lib/paraglide/messages.js";
  import ReadingProgress from "#lib/series/ReadingProgress.svelte";
  import { seriesBookList } from "#lib/series/series-books.svelte.ts";
  import { SERIES_OVERVIEW } from "#lib/series/series-overview.ts";
  import SeriesBooks from "#lib/series/SeriesBooks.svelte";
  import SeriesHeader from "#lib/series/SeriesHeader.svelte";

  import type { PageProps } from "./$types";

  const BACK_ICON_SIZE = 20;

  let { data }: PageProps = $props();

  const shown = $derived(data.shown);
  const found = $derived(shown.kind === "found" ? shown : undefined);

  const books = seriesBookList(() => {
    if (found === undefined) {
      throw new Error("a series' books were asked for while no series showed");
    }
    return found.id;
  });

  function readAgain(): void {
    void invalidate(SERIES_OVERVIEW);
    void books.load();
  }

  async function mark(picked: SeriesBook["id"][], read: ReadMark) {
    const marked = await commands.markBooks(picked, read);
    readAgain();
    return marked.status === "ok";
  }

  $effect(() => {
    if (found?.id !== undefined) {
      untrack(() => {
        void books.start();
      });
    }
  });

  onMount(() =>
    listenForLibraryChanges(() => {
      if (found !== undefined) {
        readAgain();
      }
    }, reportError),
  );
</script>

<div
  class="relative isolate -me-page-end -mbs-page-top flex flex-col gap-lg pe-page-end pbs-page-top max-medium:-ms-page-start max-medium:ps-page-start medium:-ms-xl medium:ps-xl"
>
  {#if found !== undefined}
    <div
      aria-hidden="true"
      class="absolute inset-x-none inset-bs-none z-series-band overflow-hidden bg-chip block-series-band medium:block-series-band-tablet expanded:block-series-band-wide"
    >
      {#if found.overview.cover !== null}
        <img
          src={coverUrl(found.overview.cover)}
          alt=""
          decoding="async"
          class="scale-125 object-cover blur-series-band block-full inline-full"
        />
      {/if}
      <div
        class="absolute inset-x-none inset-be-none bg-linear-to-b from-transparent to-background block-series-fade expanded:block-series-fade-wide"
      ></div>
    </div>
  {/if}
  <a
    href={resolve("/(app)")}
    class="flex items-center justify-center self-start rounded-full bg-series-crumb text-small font-semibold text-on-series-crumb backdrop-blur-glass block-series-back inline-series-back medium:gap-xs medium:rounded-field medium:ps-sm medium:pe-md medium:inline-auto expanded:block-series-crumb"
  >
    <ChevronLeft size={BACK_ICON_SIZE} aria-hidden="true" />
    <span class="sr-only medium:hidden">{m.series_back_label()}</span>
    <span class="max-medium:hidden">{m.series_back()}</span>
  </a>
  {#if found !== undefined}
    <div
      class="flex flex-col gap-xl expanded:flex-row expanded:items-start expanded:gap-2xl"
    >
      <div
        class="flex flex-col gap-lg medium:gap-xl expanded:shrink-0 expanded:gap-lg expanded:inline-series-aside"
      >
        <SeriesHeader overview={found.overview} {coverUrl} />
        <ReadingProgress overview={found.overview} />
      </div>
      <div class="flex flex-1 flex-col gap-sm min-inline-none">
        {#if books.list.kind === "failed"}
          <p class="text-body text-muted">{m.series_books_failed()}</p>
        {:else if books.list.kind === "loaded"}
          {#key found.id}
            <SeriesBooks
              books={books.list.items}
              bookCount={found.overview.bookCount}
              isComplete={books.list.isComplete}
              onNearEnd={() => {
                void books.loadMore();
              }}
              onLoadAll={() => books.loadAll()}
              onMark={mark}
            />
          {/key}
        {/if}
      </div>
    </div>
  {:else if shown.kind === "missing"}
    <div class="flex flex-col gap-sm">
      <h1 tabindex="-1" class="text-headline font-bold">
        {m.series_not_found()}
      </h1>
      <p class="text-body text-muted">{m.series_not_found_body()}</p>
    </div>
  {:else}
    <div class="flex flex-col gap-sm">
      <h1 tabindex="-1" class="text-headline font-bold">
        {m.library_title()}
      </h1>
      <p class="text-body text-muted">{m.series_failed()}</p>
    </div>
  {/if}
</div>
