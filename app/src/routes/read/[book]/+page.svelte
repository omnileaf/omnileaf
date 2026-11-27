<script lang="ts">
  import { onMount } from "svelte";

  import { refreshAll } from "$app/navigation";
  import { page } from "$app/state";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { libraryBookFileShower } from "#lib/page/show-file.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import FindFolderSheet from "#lib/library/FindFolderSheet.svelte";
  import { noticingFolderFinder } from "#lib/library/noticing-folder-finder.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import Toasts from "#lib/notices/Toasts.svelte";
  import { getBookPresence } from "#lib/reader/book-presence.svelte.ts";
  import BookProblem from "#lib/reader/BookProblem.svelte";
  import DamagedBook from "#lib/reader/DamagedBook.svelte";
  import PagedReader from "#lib/reader/PagedReader.svelte";
  import UnsupportedBook from "#lib/reader/UnsupportedBook.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { standInOpenedBook } from "#lib/series/series-stand-ins.ts";
  import { allowPinchZoom } from "#lib/reader/pinch-zoom.ts";
  import { readerLeaving } from "#lib/reader/reader-leaving.ts";
  import {
    readerSeriesOf,
    readerWayBack,
  } from "#lib/reader/reader-way-back.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const shown = $derived(data.shown);
  const screenshotMode = getScreenshotMode();
  const notices = getNotices();
  const showFile = $derived(
    libraryBookFileShower(
      shown.kind === "found" ? shown.book : shown.place,
      notices,
    ),
  );
  const isFound = $derived(shown.kind === "found");
  const folderFinder = noticingFolderFinder(notices, refreshAll);

  function findFolder(): void {
    if (shown.kind !== "found" && shown.place !== null) {
      void folderFinder.findFrom(commands.bookMissingFolder(shown.place.id));
    }
  }
  const seriesPlace = $derived(
    shown.kind === "found"
      ? screenshotMode.isOn
        ? standInOpenedBook(shown.book)
        : shown.book
      : shown.place,
  );
  const wayBack = $derived(
    readerWayBack(
      page.state.readerOrigin ?? undefined,
      readerSeriesOf(seriesPlace),
    ),
  );
  const leaveReader = readerLeaving(() => wayBack);
  const bookPresence = getBookPresence();
  const theme = getThemeSetting();
  let damagedBookRead: string | undefined = $state();

  $effect(() => {
    bookPresence.isOpen = true;
  });

  $effect(() => {
    bookPresence.isBeingRead = isFound;
  });

  $effect(() => {
    if (!isFound) {
      return;
    }
    void commands.orientScreen("followDevice");
    const lockScale = allowPinchZoom();
    return () => {
      lockScale();
      void commands.orientScreen("portraitOnPhones");
    };
  });

  $effect(() => {
    if (
      shown.kind !== "found" ||
      (shown.book.damage !== null && damagedBookRead !== shown.book.id)
    ) {
      focusPageHeading();
    }
  });

  onMount(() => {
    return () => {
      bookPresence.isOpen = false;
      bookPresence.isBeingRead = false;
      void commands.changeFullScreen("leave");
    };
  });
</script>

{#if shown.kind === "found" && shown.book.damage !== null && damagedBookRead !== shown.book.id}
  <DamagedBook
    book={shown.book}
    damage={shown.book.damage}
    platform={data.appInfo.platform}
    onRead={() => {
      damagedBookRead = shown.book.id;
    }}
    onShowFile={showFile}
    {wayBack}
    onBack={leaveReader}
  />
{:else if shown.kind === "found"}
  {#key shown.book.id}
    <PagedReader
      book={shown.book}
      platform={data.appInfo.platform}
      opensAtEnd={page.state.readerOpensAtEnd === true}
      hasJumped={page.state.readerJumped === true}
      isPagedInto={page.state.readerPagedInto === true}
      {wayBack}
      {leaveReader}
    />
  {/key}
{:else if shown.kind === "unsupported"}
  <UnsupportedBook
    place={shown.place}
    file={shown.file}
    platform={data.appInfo.platform}
    hideFilesLike={commands.hideFilesLike}
    showFileType={commands.showFileType}
    onShowFile={showFile}
    {notices}
    {wayBack}
    onBack={leaveReader}
  />
{:else}
  <BookProblem
    kind={shown.kind}
    place={shown.place}
    platform={data.appInfo.platform}
    onShowFile={showFile}
    onFind={findFolder}
    {wayBack}
    onBack={leaveReader}
  />
{/if}
<FindFolderSheet finder={folderFinder} platform={data.appInfo.platform} />
<div class="fixed inset-x-none inset-be-none z-notice">
  <Toasts
    {notices}
    platform={data.appInfo.platform}
    theme={theme.resolved}
    bottom="calc(var(--reader-toast-room, var(--spacing-safe-bottom)) + var(--spacing-lg))"
  />
</div>
