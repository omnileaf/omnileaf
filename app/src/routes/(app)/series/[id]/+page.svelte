<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";

  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    commands,
    type ReadMark,
    type SeriesBook,
    type SeriesBookListing,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import ReadingProgress from "#lib/series/ReadingProgress.svelte";
  import { seriesBookList } from "#lib/series/series-books.svelte.ts";
  import { SERIES_OVERVIEW } from "#lib/series/series-overview.ts";
  import SeriesBooks from "#lib/series/SeriesBooks.svelte";
  import SeriesHeader from "#lib/series/SeriesHeader.svelte";
  import {
    bookStandIns,
    standInOverview,
  } from "#lib/series/series-stand-ins.ts";

  import type { PageProps } from "./$types";

  const BACK_ICON_SIZE = 20;

  let { data }: PageProps = $props();

  const shown = $derived(data.shown);
  const found = $derived(shown.kind === "found" ? shown : undefined);

  const screenshotMode = getScreenshotMode();
  let listing: SeriesBookListing = $state({
    shown: "all",
    direction: "ascending",
  });
  const foundId = $derived(found?.overview.id);
  const overview = $derived(
    found === undefined || !screenshotMode.isOn
      ? found?.overview
      : standInOverview(found.overview),
  );
  const cover = $derived(
    found === undefined
      ? undefined
      : (screenshotMode.isOn ? standInLook : realLook)(found.overview).cover,
  );
  const books = $derived(
    foundId === undefined ? undefined : seriesBookList(foundId, () => listing),
  );

  let barHeight = $state(0);
  let isTitleUnderBar = $state(false);

  /** Watches the page's title against the bar, so the bar shows the title once the page's title is under it, however the page moved. */
  function watchTitleUnderBar(barBottom: number): () => void {
    const title = document.querySelector("main h1");
    if (title === null) {
      return () => undefined;
    }
    const watching = new IntersectionObserver(
      ([seen]) => {
        if (seen !== undefined) {
          isTitleUnderBar =
            !seen.isIntersecting &&
            seen.boundingClientRect.bottom <= (seen.rootBounds?.top ?? 0);
        }
      },
      { rootMargin: `${String(-barBottom)}px 0px 0px 0px` },
    );
    watching.observe(title);
    return () => {
      watching.disconnect();
    };
  }

  function readAgain(): void {
    void invalidate(SERIES_OVERVIEW);
    void books?.load();
  }

  async function mark(picked: SeriesBook["id"][], read: ReadMark) {
    const marked = await commands.markBooks(picked, read);
    if (marked.status === "error") {
      reportError(marked.error);
      return false;
    }
    readAgain();
    return true;
  }

  $effect(() => {
    const listed = books;
    untrack(() => {
      void listed?.start();
    });
  });

  $effect(() => {
    if (overview !== undefined && barHeight > 0) {
      return watchTitleUnderBar(barHeight);
    }
    return undefined;
  });

  onMount(() =>
    listenForLibraryChanges(() => {
      readAgain();
    }, reportError),
  );
</script>

<div
  class="relative isolate -me-page-end -mbs-page-top flex flex-col gap-lg pe-page-end max-medium:-ms-page-start max-medium:ps-page-start medium:-ms-xl medium:ps-xl medium:pbs-page-top"
>
  {#if found !== undefined}
    <div
      aria-hidden="true"
      class="absolute inset-x-none inset-bs-none z-series-band overflow-hidden bg-chip block-series-band medium:block-series-band-tablet expanded:block-series-band-wide"
    >
      {#if cover?.kind === "picture"}
        <img
          src={coverUrl(cover.path)}
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
  <header
    bind:clientHeight={barHeight}
    class={[
      "flex items-center gap-sm motion-safe:transition-colors motion-safe:duration-fade max-medium:sticky max-medium:-inset-bs-page-top max-medium:z-series-bar max-medium:-ms-page-start max-medium:-me-page-end max-medium:ps-page-start max-medium:pe-page-end max-medium:pbs-series-bar-top max-medium:pbe-xs",
      isTitleUnderBar && "max-medium:bg-background",
    ]}
  >
    <a
      href={resolve("/(app)")}
      data-back-link
      class="flex shrink-0 items-center justify-center self-start rounded-full bg-series-crumb text-small font-semibold text-on-series-crumb backdrop-blur-glass block-series-back inline-series-back medium:gap-xs medium:rounded-field medium:ps-sm medium:pe-md medium:inline-auto expanded:block-series-crumb android:max-medium:block-touch-target android:max-medium:inline-touch-target"
    >
      <ChevronLeft size={BACK_ICON_SIZE} aria-hidden="true" />
      <span class="sr-only medium:hidden">{m.series_back_label()}</span>
      <span class="max-medium:hidden">{m.series_back()}</span>
    </a>
    {#if overview !== undefined}
      <span
        aria-hidden="true"
        class={[
          "truncate text-lead font-bold motion-safe:transition-opacity motion-safe:duration-fade medium:hidden",
          isTitleUnderBar ? "opacity-100" : "opacity-0",
        ]}
      >
        {overview.title}
      </span>
    {/if}
  </header>
  {#if found !== undefined && overview !== undefined && cover !== undefined}
    <div
      class="flex flex-col gap-xl expanded:flex-row expanded:items-start expanded:gap-2xl"
    >
      <div
        class="flex flex-col gap-lg medium:gap-xl expanded:shrink-0 expanded:gap-lg expanded:inline-series-aside"
      >
        <SeriesHeader {overview} {cover} {coverUrl} />
        <ReadingProgress {overview} />
      </div>
      <div class="flex flex-1 flex-col gap-sm min-inline-none">
        {#if books?.list.kind === "failed"}
          <p class="text-body text-muted">{m.series_books_failed()}</p>
        {:else if books?.list.kind === "loaded"}
          {#key foundId}
            <SeriesBooks
              books={screenshotMode.isOn
                ? books.list.items.map(bookStandIns(found.overview))
                : books.list.items}
              bookCount={found.overview.bookCount}
              {listing}
              onListing={(chosen: SeriesBookListing) => {
                listing = chosen;
                void books.start();
              }}
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
