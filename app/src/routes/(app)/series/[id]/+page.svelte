<script lang="ts">
  import { ChevronLeft } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    commands,
    type ReadMark,
    type SeriesBook,
    type SeriesBookListing,
  } from "#lib/ipc/bindings.ts";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import {
    listenForLibraryChanges,
    listenForReadingSaved,
  } from "#lib/library/library-changes.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { MEDIUM_QUERY } from "#lib/page/breakpoints.ts";
  import { getNotices } from "#lib/notices/notices.ts";
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
  const EVERY_BOOK_IN_ORDER: SeriesBookListing = {
    shown: "all",
    direction: "ascending",
  };

  let { data }: PageProps = $props();

  const shown = $derived(data.shown);
  const found = $derived(shown.kind === "found" ? shown : undefined);

  const screenshotMode = getScreenshotMode();
  const isWide = new MediaQuery(MEDIUM_QUERY);
  const notices = getNotices();
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

  function opposite(read: ReadMark): ReadMark {
    return read === "read" ? "unread" : "read";
  }

  function markedTitle(read: ReadMark, count: number): string {
    return read === "read"
      ? m.series_marked_read({ count })
      : m.series_marked_unread({ count });
  }

  async function markAll(read: ReadMark): Promise<void> {
    if (foundId === undefined) {
      return;
    }
    const all = seriesBookList(foundId, () => EVERY_BOOK_IN_ORDER);
    await all.start();
    await all.loadAll();
    if (all.list.kind !== "loaded") {
      reportError(new Error(`read the books of series ${foundId} to mark`));
      return;
    }
    const changing = all.list.items
      .filter((book) => (book.reading.state === "read") !== (read === "read"))
      .map((book) => book.id);
    if (changing.length > 0 && (await mark(changing, read))) {
      notices.offerUndo({
        title: markedTitle(read, changing.length),
        undo: () => {
          void mark(changing, opposite(read));
        },
      });
    }
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

  $effect(() => {
    if (foundId === undefined) {
      return undefined;
    }
    return listenForReadingSaved(
      foundId,
      () => {
        readAgain();
      },
      reportError,
    );
  });
</script>

<div
  class="relative isolate -me-page-end -mbs-page-top flex flex-col gap-lg pe-page-end max-medium:-ms-page-start max-medium:ps-page-start medium:-ms-gutter medium:ps-gutter medium:pbs-page-top"
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
      "max-medium:while-picking:invisible",
    ]}
  >
    {#if isWide.current}
      <Breadcrumb
        aria-label={m.series_breadcrumb()}
        class="flex items-center rounded-control border border-border bg-card px-md text-small text-muted shadow-raised block-series-crumb"
      >
        <BreadcrumbItem>
          <a
            href={resolve("/(app)")}
            data-back-link
            class="font-medium transition-control hover:text-foreground"
          >
            {m.series_back()}
          </a>
        </BreadcrumbItem>
        {#if overview !== undefined}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage class="font-semibold text-foreground">
              {overview.title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        {/if}
      </Breadcrumb>
    {:else}
      <a
        href={resolve("/(app)")}
        data-back-link
        aria-label={m.series_back_label()}
        class="flex shrink-0 items-center justify-center self-start rounded-full border border-border bg-card text-foreground shadow-raised block-series-back inline-series-back android:block-touch-target android:inline-touch-target"
      >
        <ChevronLeft size={BACK_ICON_SIZE} aria-hidden="true" />
      </a>
    {/if}
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
        <ReadingProgress {overview} onMarkAll={markAll} />
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
              platform={data.appInfo.platform}
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
