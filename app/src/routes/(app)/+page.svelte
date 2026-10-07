<script lang="ts">
  import { onMount } from "svelte";

  import { commands } from "$lib/ipc/bindings";
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import AddFolderButton from "$lib/library/AddFolderButton.svelte";
  import { coverUrl } from "$lib/library/cover-url";
  import { FolderAdding } from "$lib/library/folder-adding.svelte";
  import FolderNotice from "$lib/library/FolderNotice.svelte";
  import { listenForLibraryChanges } from "$lib/library/library-changes";
  import { LibrarySeriesList } from "$lib/library/library-series.svelte";
  import SeriesCovers from "$lib/library/SeriesCovers.svelte";
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
  const adding = new FolderAdding(addFolderWithProgress, () => data.notices);

  const isEmpty = $derived(
    library.list.kind === "loaded" && library.list.series.length === 0,
  );

  let headingAddFolder: HTMLButtonElement | undefined = $state();
  let emptyAddFolder: HTMLButtonElement | undefined = $state();

  onMount(() => {
    void library.load();
    return listenForLibraryChanges(() => {
      void library.load();
    }, reportError);
  });

  function focusAddFolder(): void {
    (isEmpty ? emptyAddFolder : headingAddFolder)?.focus();
  }
</script>

<div class="flex items-center justify-between gap-sm">
  <CollectionHeading
    title={m.library_title()}
    showsLabel={screenshotMode.showsLabel}
  />
  <AddFolderButton
    bind:element={headingAddFolder}
    {adding}
    placement="page-heading"
  />
</div>
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
  {:else}
    <div class="mbs-xl">
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
