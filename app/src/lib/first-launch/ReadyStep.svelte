<script lang="ts" module>
  export type FinishOutcome = "finished" | "failed";
</script>

<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";

  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import type {
    LibraryFolder,
    LibrarySeries,
    Platform,
  } from "#lib/ipc/bindings.ts";
  import type { AddFolder } from "#lib/library/add-folder.ts";
  import type { LibraryFolders } from "#lib/library/library-folders.svelte.ts";
  import LinkedFolders from "#lib/library/LinkedFolders.svelte";
  import type { Notices } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  import { type CountIn, FolderSummaries } from "./folder-summaries.svelte";
  import ReadyMark from "./ReadyMark.svelte";
  import ReadyShelf from "./ReadyShelf.svelte";
  import StepButton from "./StepButton.svelte";
  import StepFrame from "./StepFrame.svelte";
  import StepHeader from "./StepHeader.svelte";

  const FIXES = {
    android: m.first_launch_ready_fix_android,
    ios: m.first_launch_ready_fix_ios,
    macos: m.first_launch_ready_fix_macos,
    windows: m.first_launch_ready_fix_windows,
    linux: m.first_launch_ready_fix_linux,
  } satisfies Record<Platform, () => string>;

  let {
    platform,
    folders,
    addFolder,
    notices,
    countSeriesIn,
    shelfSeries,
    onFinish,
  }: {
    platform: Platform;
    folders: LibraryFolders;
    addFolder: AddFolder;
    notices: Notices;
    countSeriesIn: CountIn;
    shelfSeries: () => Promise<readonly LibrarySeries[]>;
    onFinish: () => Promise<FinishOutcome>;
  } = $props();

  const screenshotMode = getScreenshotMode();
  const summaries = new FolderSummaries(
    (folder) => countSeriesIn(folder),
    (folder) => folders.countBooks(folder),
  );

  let outcome: FinishOutcome | "finishing" | undefined = $state();
  let shelf: readonly LibrarySeries[] = $state([]);

  const linked = $derived(
    folders.list.kind === "loaded" ? folders.list.linked : [],
  );
  const readable = $derived(linked.filter((folder) => folder.isAvailable));
  const unreadable = $derived(linked.find((folder) => !folder.isAvailable));
  const total = $derived(summaries.total(readable));
  const hasCounted = $derived(summaries.hasCounted(readable));

  $effect(() => {
    void summaries.load(readable);
  });

  $effect(() => {
    if (readable.length > 0) {
      void shelfSeries().then((series) => {
        shelf = series;
      });
    }
  });

  function summaryOf(folder: LibraryFolder): string | undefined {
    const summary = summaries.of(folder);
    return summary === undefined
      ? undefined
      : m.first_launch_ready_folder({
          series: m.library_series_count({ count: summary.series }),
          books: m.first_launch_folder_books({ count: summary.books }),
        });
  }

  async function finish(): Promise<void> {
    outcome = "finishing";
    outcome = await onFinish();
  }
</script>

<StepFrame step="ready">
  <StepHeader>
    {#snippet badge()}
      <ReadyMark isEmpty={linked.length === 0} />
    {/snippet}
    {#if linked.length === 0}
      {m.first_launch_ready_empty_title()}
    {:else if unreadable !== undefined}
      {m.first_launch_ready_unreadable_title({ name: unreadable.name })}
    {:else if !hasCounted}
      {m.first_launch_ready_title()}
    {:else}
      {m.first_launch_ready_found_title({
        series: m.library_series_count({ count: total.series }),
        books: m.first_launch_folder_books({ count: total.books }),
      })}
    {/if}
    {#snippet lead()}
      {#if linked.length === 0}
        {m.first_launch_ready_empty_body()}
      {:else if unreadable !== undefined}
        {m.first_launch_ready_unreadable_body()}
      {:else}
        {m.first_launch_ready_body()}
      {/if}
    {/snippet}
  </StepHeader>
  {#if unreadable !== undefined}
    <Alert tone="warning" icon={TriangleAlert} role="alert">
      <AlertTitle>{m.first_launch_ready_fix_title()}</AlertTitle>
      <AlertDescription>{FIXES[platform]()}</AlertDescription>
    </Alert>
  {:else if shelf.length > 0}
    <ReadyShelf series={shelf} usesStandIns={screenshotMode.isOn} />
  {/if}
  {#if linked.length > 0}
    <LinkedFolders
      {platform}
      {folders}
      {addFolder}
      {notices}
      usesStandIns={screenshotMode.isOn}
      addPlacement="none"
    >
      {#snippet rowDetail(folder: LibraryFolder)}
        {summaryOf(folder)}
      {/snippet}
    </LinkedFolders>
  {/if}
  {#if outcome === "failed"}
    <p role="alert" class="text-center">{m.first_launch_finish_failed()}</p>
  {/if}
  {#snippet actions()}
    <StepButton
      kind="primary"
      disabled={outcome === "finishing"}
      onclick={() => {
        void finish();
      }}
    >
      {m.first_launch_open_library()}
    </StepButton>
  {/snippet}
</StepFrame>
