<script lang="ts">
  import { onMount } from "svelte";

  import { commands, type LibraryView } from "$lib/ipc/bindings";
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import AddFolderButton from "$lib/library/AddFolderButton.svelte";
  import { coverUrl } from "$lib/library/cover-url";
  import { FolderAdding } from "$lib/library/folder-adding.svelte";
  import FolderNotice from "$lib/library/FolderNotice.svelte";
  import { listenForLibraryChanges } from "$lib/library/library-changes";
  import { LibrarySeriesList } from "$lib/library/library-series.svelte";
  import { LibrarySeriesCount } from "$lib/library/library-series-count.svelte";
  import { LibraryViewSetting } from "$lib/library/library-view.svelte";
  import SeriesCount from "$lib/library/SeriesCount.svelte";
  import SeriesCovers from "$lib/library/SeriesCovers.svelte";
  import ViewOptions from "$lib/library/ViewOptions.svelte";
  import LibraryGlyph from "$lib/navigation/LibraryGlyph.svelte";
  import EmptyState from "$lib/page/EmptyState.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import CollectionHeading from "$lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const library = new LibrarySeriesList((after) =>
    commands.librarySeries(after),
  );
  const seriesCount = new LibrarySeriesCount(
    () => commands.librarySeriesCount(),
    (error) => {
      reportError(error);
    },
  );
  const view = new LibraryViewSetting(
    () => commands.libraryView(),
    (chosen) => commands.setLibraryView(chosen),
    (error) => {
      reportError(error);
    },
  );
  const adding = new FolderAdding(addFolderWithProgress, () => data.notices);

  const isEmpty = $derived(
    library.list.kind === "loaded" && library.list.series.length === 0,
  );
  const shown = $derived(
    library.list.kind === "loaded" &&
      library.list.series.length > 0 &&
      view.reading.kind === "read"
      ? { series: library.list, view: view.reading.view }
      : undefined,
  );
  const showsItemCounts = $derived(shown?.view.showsItemCounts === true);

  $effect(() => {
    if (showsItemCounts) {
      void seriesCount.load();
    }
  });

  let headingAddFolder: HTMLButtonElement | undefined = $state();
  let emptyAddFolder: HTMLButtonElement | undefined = $state();

  onMount(() => {
    void library.load();
    void view.load();
    return listenForLibraryChanges(() => {
      void library.load();
      if (showsItemCounts) {
        void seriesCount.load();
      }
    }, reportError);
  });

  function focusAddFolder(): void {
    (isEmpty ? emptyAddFolder : headingAddFolder)?.focus();
  }
</script>

<CollectionHeading
  title={m.library_title()}
  showsLabel={screenshotMode.showsLabel}
>
  {#snippet count()}
    {#if showsItemCounts && seriesCount.count !== undefined}
      <SeriesCount count={seriesCount.count} />
    {/if}
  {/snippet}
  {#snippet actions()}
    {#if shown !== undefined}
      <ViewOptions
        view={shown.view}
        onChoose={(chosen: LibraryView) => {
          view.choose(chosen);
        }}
      />
    {/if}
    <AddFolderButton
      bind:element={headingAddFolder}
      {adding}
      placement="page-heading"
    />
  {/snippet}
</CollectionHeading>
{#if isEmpty}
  <EmptyState
    icon={LibraryGlyph}
    title={m.library_empty()}
    body={m.library_empty_body()}
  >
    <div class="mbs-sm flex flex-col items-center gap-md max-inline-prose">
      <AddFolderButton
        bind:element={emptyAddFolder}
        {adding}
        placement="empty-state"
      />
      <FolderNotice
        {adding}
        usesStandIns={screenshotMode.isOn}
        onDismissed={focusAddFolder}
      />
    </div>
  </EmptyState>
{:else if library.list.kind !== "loading"}
  <div class="mbs-sm">
    <FolderNotice
      {adding}
      usesStandIns={screenshotMode.isOn}
      onDismissed={focusAddFolder}
    />
  </div>
  {#if library.list.kind === "failed"}
    <p class="mbs-sm text-muted">{m.library_series_failed()}</p>
  {:else if shown !== undefined}
    <div class="mbs-xl">
      <SeriesCovers
        series={shown.series.series}
        isComplete={shown.series.isComplete}
        onNearEnd={() => {
          void library.loadMore();
        }}
        {coverUrl}
        view={shown.view}
        usesStandIns={screenshotMode.isOn}
      />
    </div>
  {/if}
{/if}
