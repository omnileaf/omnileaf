<script lang="ts">
  import { onMount } from "svelte";

  import { commands, type LibraryView } from "$lib/ipc/bindings";
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import AddFolderButton from "$lib/library/AddFolderButton.svelte";
  import { coverUrl } from "$lib/library/cover-url";
  import EmptyLibrary from "$lib/library/EmptyLibrary.svelte";
  import { FolderAdding } from "$lib/library/folder-adding.svelte";
  import FolderAddingStatus from "$lib/library/FolderAddingStatus.svelte";
  import { listenForLibraryChanges } from "$lib/library/library-changes";
  import { LibrarySeriesList } from "$lib/library/library-series.svelte";
  import { LibrarySeriesCount } from "$lib/library/library-series-count.svelte";
  import { LibraryViewSetting } from "$lib/library/library-view.svelte";
  import SeriesCount from "$lib/library/SeriesCount.svelte";
  import SeriesCovers from "$lib/library/SeriesCovers.svelte";
  import ViewOptions from "$lib/library/ViewOptions.svelte";
  import { m } from "$lib/paraglide/messages.js";

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
  const adding = new FolderAdding(addFolderWithProgress);

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
</script>

<div class="flex flex-col min-block-full">
  <header class="flex items-center gap-sm">
    <div class="flex flex-1 items-baseline gap-title-count min-inline-none">
      <h1 tabindex="-1" class="text-headline font-bold">
        {m.library_title()}
      </h1>
      {#if showsItemCounts && seriesCount.count !== undefined}
        <SeriesCount count={seriesCount.count} />
      {/if}
    </div>
    {#if shown !== undefined}
      <ViewOptions
        view={shown.view}
        onChoose={(chosen: LibraryView) => {
          view.choose(chosen);
        }}
      />
    {/if}
    <AddFolderButton {adding} look="header" />
  </header>
  <div class="mbs-sm">
    <FolderAddingStatus {adding} />
  </div>
  {#if library.list.kind === "failed"}
    <p class="mbs-sm text-muted">{m.library_series_failed()}</p>
  {:else if library.list.kind === "loaded" && library.list.series.length === 0}
    <EmptyLibrary {adding} />
  {:else if shown !== undefined}
    <div class="mbs-lg">
      <SeriesCovers
        series={shown.series.series}
        isComplete={shown.series.isComplete}
        onNearEnd={() => {
          void library.loadMore();
        }}
        {coverUrl}
        view={shown.view}
      />
    </div>
  {/if}
</div>
