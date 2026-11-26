<script lang="ts">
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    commands,
    type SeriesBook,
    type SeriesBookListing,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import FindFolderSheet from "#lib/library/FindFolderSheet.svelte";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { noticeNotConnected } from "#lib/library/missing-folder-notices.ts";
  import { noticingFolderFinder } from "#lib/library/noticing-folder-finder.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { getBackGoesUp } from "#lib/navigation/back-goes-up.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { showFolderLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { EVERY_BOOK_IN_ORDER } from "#lib/series/book-listing.ts";
  import { volumeBooksHeading } from "#lib/series/books-heading.ts";
  import {
    type ContinueProgress,
    VOLUME_CONTINUE_WORDS,
  } from "#lib/series/continue-card.ts";
  import ContinueCard from "#lib/series/ContinueCard.svelte";
  import { listedSeriesBooks } from "#lib/series/listed-series-books.svelte.ts";
  import { seriesBookCommands } from "#lib/series/series-book-commands.ts";
  import { SERIES_OVERVIEW } from "#lib/series/series-overview.ts";
  import {
    standInBook,
    standInOverview,
    standInVolume,
  } from "#lib/series/series-stand-ins.ts";
  import SeriesBar from "#lib/series/SeriesBar.svelte";
  import SeriesBooks from "#lib/series/SeriesBooks.svelte";
  import { watchTitleUnderBar } from "#lib/page/title-under-bar.ts";
  import VolumeAbout from "#lib/series/VolumeAbout.svelte";
  import type { ListingChange } from "#lib/series-sections/section-listing.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const backGoesUp = getBackGoesUp();
  const notices = getNotices();
  const screenshotMode = getScreenshotMode();
  const seriesId = $derived(data.overview.id);
  const volumeNumber = $derived(data.volume.volume);
  const volumeKey = $derived(`${seriesId}:${String(volumeNumber)}`);
  let chosen: { volume: string; change: ListingChange } | undefined = $state();
  const chosenHere = $derived(
    chosen?.volume === volumeKey ? chosen.change : {},
  );
  const listing: SeriesBookListing = $derived({
    ...EVERY_BOOK_IN_ORDER,
    ...chosenHere,
    volume: volumeNumber,
  });
  const listedBooks = listedSeriesBooks(
    () => seriesId,
    () => listing,
  );
  const books = $derived(listedBooks.pages);
  const overview = $derived(
    screenshotMode.isOn ? standInOverview(data.overview) : data.overview,
  );
  const volume = $derived(
    screenshotMode.isOn ? standInVolume(data.volume) : data.volume,
  );
  const progress: ContinueProgress = $derived({ ...volume, secondsLeft: null });
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const cover = $derived(
    (screenshotMode.isOn ? standInLook : realLook)({
      ...data.overview,
      cover: data.volume.cover,
    }).cover,
  );
  let barHeight = $state(0);
  let isTitleUnderBar = $state(false);

  async function readAgainOrLeave(): Promise<void> {
    const left = await commands.seriesVolume(seriesId, volumeNumber);
    if (left.status === "ok" && left.data === null) {
      await backGoesUp.followLinkTo(
        resolve("/(app)/series/[id]", { id: seriesId }),
      );
      return;
    }
    void invalidate(SERIES_OVERVIEW);
    void books?.load();
  }

  function readAgain(): void {
    void readAgainOrLeave();
  }

  const bookCommands = seriesBookCommands({
    listName: () => `volume ${String(volumeNumber)} of series ${seriesId}`,
    listed: () => books?.list,
    notices,
    readAgain,
  });

  const folderFinder = noticingFolderFinder(notices, () => {
    readAgain();
    return Promise.resolve();
  });

  function findBookFolder(book: SeriesBook): void {
    void folderFinder.findFrom(commands.bookMissingFolder(book.id));
  }

  function sayBookNotConnected(book: SeriesBook): void {
    noticeNotConnected(notices, book.title, () => {
      findBookFolder(book);
    });
  }

  function choose(change: ListingChange): void {
    chosen = { volume: volumeKey, change: { ...chosenHere, ...change } };
    listedBooks.startAgain();
  }

  $effect(() => {
    if (barHeight === 0) {
      return undefined;
    }
    return watchTitleUnderBar(barHeight, (isUnder) => {
      isTitleUnderBar = isUnder;
    });
  });

  onMount(() =>
    listenForLibraryChanges(readAgain, (error: unknown) => {
      reportError(error);
    }),
  );
</script>

<div
  data-ground="grouped"
  class="@container relative isolate -me-page-end -mbs-page-top flex flex-1 flex-col pe-page-end max-medium:-ms-page-start max-medium:ps-page-start medium:-ms-gutter medium:ps-gutter touch:bg-native-grouped-ground"
>
  <SeriesBar
    title={m.series_volume({ number: volumeNumber })}
    {isTitleUnderBar}
    bind:height={barHeight}
    onMarkAll={undefined}
    onLabel={undefined}
    onEditDetails={undefined}
    showFolder={{
      label: showFolderLabel(data.appInfo.platform),
      onShow: undefined,
    }}
    backToSeries={overview}
    restingPlacement="folded"
  />
  <div class="flex flex-col gap-xl max-expanded:mbs-sm">
    <VolumeAbout series={overview} {volume} {cover} {coverUrl} />
    <ContinueCard
      {progress}
      words={VOLUME_CONTINUE_WORDS}
      {cover}
      {coverUrl}
      isWide={isWide.current}
      onFind={findBookFolder}
    />
    {#if books?.list.kind === "failed"}
      <p class="text-body text-muted">{m.series_books_failed()}</p>
    {:else if books?.list.kind === "loaded"}
      <SeriesBooks
        books={screenshotMode.isOn
          ? books.list.items.map(standInBook)
          : books.list.items}
        sections={[]}
        seriesTitle={overview.title}
        heading={volumeBooksHeading(data.volume)}
        hasShownChoices={false}
        {listing}
        onListing={choose}
        isComplete={books.list.isComplete}
        onNearEnd={() => {
          void books.loadMore();
        }}
        onLoadAll={() => books.loadAll()}
        onMark={bookCommands.mark}
        onBookmark={bookCommands.bookmark}
        onRemoveBookmarks={bookCommands.removeBookmarks}
        onRemove={bookCommands.remove}
        onShowInFolder={bookCommands.showFile}
        onNotConnected={sayBookNotConnected}
        onFindFolder={findBookFolder}
        platform={data.appInfo.platform}
      />
    {/if}
  </div>
</div>

<FindFolderSheet finder={folderFinder} platform={data.appInfo.platform} />
