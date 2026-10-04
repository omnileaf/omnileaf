<script lang="ts">
  import { onMount } from "svelte";

  import { commands } from "$lib/ipc/bindings";
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import AddFolderButton from "$lib/library/AddFolderButton.svelte";
  import { coverUrl } from "$lib/library/cover-url";
  import EmptyLibrary from "$lib/library/EmptyLibrary.svelte";
  import { FolderAdding } from "$lib/library/folder-adding.svelte";
  import FolderAddingStatus from "$lib/library/FolderAddingStatus.svelte";
  import { listenForLibraryChanges } from "$lib/library/library-changes";
  import { LibrarySeriesList } from "$lib/library/library-series.svelte";
  import SeriesCovers from "$lib/library/SeriesCovers.svelte";
  import { m } from "$lib/paraglide/messages.js";

  const library = new LibrarySeriesList((after) =>
    commands.librarySeries(after),
  );
  const adding = new FolderAdding(addFolderWithProgress);

  onMount(() => {
    void library.load();
    return listenForLibraryChanges(() => {
      void library.load();
    }, reportError);
  });
</script>

<div class="flex flex-col min-block-full">
  <header class="flex items-center gap-sm">
    <h1 tabindex="-1" class="flex-1 text-headline font-bold">
      {m.library_title()}
    </h1>
    <AddFolderButton {adding} look="header" />
  </header>
  <div class="mbs-sm">
    <FolderAddingStatus {adding} />
  </div>
  {#if library.list.kind === "failed"}
    <p class="mbs-sm text-muted">{m.library_series_failed()}</p>
  {:else if library.list.kind === "loaded"}
    {#if library.list.series.length === 0}
      <EmptyLibrary {adding} />
    {:else}
      <div class="mbs-lg">
        <SeriesCovers
          series={library.list.series}
          isComplete={library.list.isComplete}
          onNearEnd={() => {
            void library.loadMore();
          }}
          {coverUrl}
        />
      </div>
    {/if}
  {/if}
</div>
