<script lang="ts">
  import { CircleAlert, RefreshCw } from "@lucide/svelte";
  import { onMount, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    commands,
    type Platform,
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
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import PageToolbar from "#lib/page/PageToolbar.svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { rescanEveryFolder } from "#lib/library/rescan-folder.ts";
  import RelatedSeries from "#lib/series/RelatedSeries.svelte";
  import SeriesSkeleton from "#lib/series/SeriesSkeleton.svelte";
  import SeriesWithoutBooks from "#lib/series/SeriesWithoutBooks.svelte";
  import { getNotices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import ContinueCard from "#lib/series/ContinueCard.svelte";
  import { seriesBookList } from "#lib/series/series-books.svelte.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import {
    SERIES_OVERVIEW,
    type SeriesShown,
  } from "#lib/series/series-overview.ts";
  import SeriesBooks from "#lib/series/SeriesBooks.svelte";
  import SeriesAbout from "#lib/series/SeriesAbout.svelte";
  import SeriesBand from "#lib/series/SeriesBand.svelte";
  import SeriesBar from "#lib/series/SeriesBar.svelte";
  import {
    bookStandIns,
    standInOverview,
  } from "#lib/series/series-stand-ins.ts";

  import type { PageProps } from "./$types";

  const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];
  const TRY_AGAIN_ICON_SIZE = 16;
  const EVERY_BOOK_IN_ORDER: SeriesBookListing = {
    shown: "all",
    direction: "ascending",
  };

  let { data }: PageProps = $props();

  let settled: { id: string; shown: SeriesShown } | undefined = $state();
  const shown = $derived(settled?.id === data.id ? settled.shown : undefined);
  const found = $derived(shown?.kind === "found" ? shown : undefined);

  const screenshotMode = getScreenshotMode();
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const hasToolbar = $derived(
    DESKTOPS.includes(data.appInfo.platform) && isWide.current,
  );
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

  async function rescan(): Promise<void> {
    await rescanEveryFolder();
    readAgain();
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
    const { id, shown: coming } = data;
    if (!(coming instanceof Promise)) {
      settled = { id, shown: coming };
      return undefined;
    }
    let isAwaited = true;
    void coming.then(async (read) => {
      if (!isAwaited) {
        return;
      }
      const isFirst = settled?.id !== id;
      settled = { id, shown: read };
      await tick();
      if (isFirst && document.activeElement === document.body) {
        focusPageHeading();
      }
    });
    return () => {
      isAwaited = false;
    };
  });

  $effect(() => {
    const listed = books;
    untrack(() => {
      void listed?.start();
    });
  });

  $effect(() => {
    if (overview !== undefined && barHeight > 0 && !hasToolbar) {
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

{#if hasToolbar}
  <PageToolbar>
    <Breadcrumb
      aria-label={m.series_breadcrumb()}
      class="flex items-center text-small text-muted min-inline-none"
    >
      <BreadcrumbItem>
        <a
          href={resolve("/(app)")}
          data-back-link
          class="transition-control hover:text-foreground"
        >
          {m.series_back()}
        </a>
      </BreadcrumbItem>
      {#if overview !== undefined}
        <BreadcrumbSeparator />
        <BreadcrumbItem class="min-inline-none">
          <BreadcrumbPage
            class="block truncate text-foreground max-inline-series-crumb-title"
          >
            {overview.title}
          </BreadcrumbPage>
        </BreadcrumbItem>
      {/if}
    </Breadcrumb>
  </PageToolbar>
{/if}
<div
  data-ground="grouped"
  class={[
    "@container relative isolate -me-page-end flex flex-1 flex-col pe-page-end max-medium:-ms-page-start max-medium:ps-page-start medium:-ms-gutter medium:ps-gutter ios:bg-ios-grouped",
    hasToolbar ? "pbs-xl" : "-mbs-page-top",
  ]}
>
  {#if cover !== undefined}
    <SeriesBand {cover} />
  {/if}
  {#if !hasToolbar}
    <SeriesBar
      title={overview?.title}
      {isTitleUnderBar}
      bind:height={barHeight}
      onMarkAll={found === undefined ? undefined : markAll}
    />
  {/if}
  {#if found !== undefined && overview !== undefined && cover !== undefined}
    <div
      class="flex flex-col gap-xl max-expanded:mbs-sm @series-split:flex-row @series-split:items-start @series-split:gap-2xl"
    >
      <SeriesAbout
        {overview}
        {cover}
        {coverUrl}
        isWide={isWide.current}
        onMarkAll={markAll}
      />
      <div class="flex flex-1 flex-col gap-lg min-inline-none">
        {#if overview.bookCount === 0}
          <SeriesWithoutBooks
            platform={data.appInfo.platform}
            onRescan={rescan}
          />
        {:else}
          <ContinueCard {overview} isWide={isWide.current} />
          {#if books?.list.kind === "failed"}
            <p class="text-body text-muted">{m.series_books_failed()}</p>
          {:else if books?.list.kind === "loaded"}
            {#key foundId}
              <SeriesBooks
                books={screenshotMode.isOn
                  ? books.list.items.map(bookStandIns(found.overview))
                  : books.list.items}
                bookCount={found.overview.bookCount}
                readCount={found.overview.readCount}
                bookmarkCount={found.overview.bookmarkCount}
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
        {/if}
        <RelatedSeries
          related={found.overview.related}
          usesStandIns={screenshotMode.isOn}
        />
      </div>
    </div>
  {:else if shown === undefined}
    <SeriesSkeleton />
  {:else if shown.kind === "missing"}
    <div class="flex flex-col gap-sm">
      <h1 tabindex="-1" class="text-headline font-bold">
        {m.series_not_found()}
      </h1>
      <p class="text-body text-muted">{m.series_not_found_body()}</p>
    </div>
  {:else}
    <h1 tabindex="-1" class="sr-only">{m.library_title()}</h1>
    <div class="flex flex-1 flex-col">
      <EmptyState
        icon={CircleAlert}
        role="alert"
        title={m.series_failed()}
        body={m.library_unchanged()}
      >
        <Button
          type="button"
          look="outline"
          class="mbs-lg flex items-center gap-sm rounded-shadcn-control px-lg font-medium min-block-touch-target expanded:text-small expanded:min-block-pointer-button"
          onclick={readAgain}
        >
          <RefreshCw size={TRY_AGAIN_ICON_SIZE} aria-hidden="true" />
          {m.library_try_again()}
        </Button>
      </EmptyState>
    </div>
  {/if}
</div>
