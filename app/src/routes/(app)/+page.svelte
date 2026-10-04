<script lang="ts">
  import { onMount } from "svelte";

  import { commands } from "$lib/ipc/bindings";
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import { coverUrl } from "$lib/library/cover-url";
  import { LibrarySeriesList } from "$lib/library/library-series.svelte";
  import SeriesCovers from "$lib/library/SeriesCovers.svelte";
  import { m } from "$lib/paraglide/messages.js";

  const library = new LibrarySeriesList((after) =>
    commands.librarySeries(after),
  );

  onMount(() => {
    void library.load();
  });
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.library_title()}</h1>
{#if library.list.kind === "failed"}
  <p class="mbs-sm text-muted">{m.library_series_failed()}</p>
{:else if library.list.kind === "loaded" && library.list.series.length === 0}
  <p class="mbs-sm text-muted">{m.library_empty()}</p>
{/if}
<div class="mbs-lg">
  <AddLibraryFolder
    addFolder={addFolderWithProgress}
    onFinished={() => {
      void library.load();
    }}
  />
</div>
{#if library.list.kind === "loaded" && library.list.series.length > 0}
  <div class="mbs-xl">
    <SeriesCovers series={library.list.series} {coverUrl} />
  </div>
{/if}
