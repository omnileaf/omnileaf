<script lang="ts">
  import { CircleAlert, FolderOpen, RefreshCw } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";

  import {
    commands,
    DEFAULT_LIBRARY_LISTING,
    DEFAULT_LIBRARY_VIEW,
    type LibraryListing,
    type LibraryView,
  } from "#lib/ipc/bindings.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import AddFolderButton from "#lib/library/AddFolderButton.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import FilterAndSort from "#lib/library/FilterAndSort.svelte";
  import { FolderAdding } from "#lib/library/folder-adding.svelte.ts";
  import FolderNotice from "#lib/library/FolderNotice.svelte";
  import ContinueRow from "#lib/library/ContinueRow.svelte";
  import CoverSkeletons from "#lib/library/CoverSkeletons.svelte";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { filtersOn, withoutFilters } from "#lib/library/library-listing.ts";
  import { librarySeriesList } from "#lib/library/library-series.svelte.ts";
  import { LibrarySeriesCount } from "#lib/library/library-series-count.svelte.ts";
  import NoMatches from "#lib/library/NoMatches.svelte";
  import SeriesCount from "#lib/library/SeriesCount.svelte";
  import SeriesCovers from "#lib/library/SeriesCovers.svelte";
  import { StoredChoice } from "#lib/library/stored-choice.svelte.ts";
  import ViewOptions from "#lib/library/ViewOptions.svelte";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import LibrarySearchEntry from "#lib/search/LibrarySearchEntry.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const TRY_AGAIN_ICON_SIZE = 16;

  const screenshotMode = getScreenshotMode();
  const listing = new StoredChoice<LibraryListing>(
    {
      read: () => commands.libraryListing(),
      store: (chosen: LibraryListing) => commands.setLibraryListing(chosen),
      fallback: DEFAULT_LIBRARY_LISTING,
    },
    (error) => {
      reportError(error);
    },
  );
  const library = librarySeriesList((after) =>
    commands.librarySeries(after, listedBy()),
  );
  const seriesCount = new LibrarySeriesCount(
    () => commands.librarySeriesCount(listedBy().filter),
    (error) => {
      reportError(error);
    },
  );
  const view = new StoredChoice<LibraryView>(
    {
      read: () => commands.libraryView(),
      store: (chosen: LibraryView) => commands.setLibraryView(chosen),
      fallback: DEFAULT_LIBRARY_VIEW,
    },
    (error) => {
      reportError(error);
    },
  );
  const notices = getNotices();
  const adding = new FolderAdding(addFolderWithProgress, () => notices);

  let isCountWanted = $state(false);

  const chosenListing = $derived(
    listing.reading.kind === "read" ? listing.reading.value : undefined,
  );
  let isListFiltered = $state(false);

  const listsNothing = $derived(
    library.list.kind === "loaded" && library.list.items.length === 0,
  );
  let holdsNoSeries = $state(false);
  const isEmpty = $derived(listsNothing && (!isListFiltered || holdsNoSeries));
  const loaded = $derived(
    library.list.kind === "loaded" && view.reading.kind === "read"
      ? { series: library.list, view: view.reading.value }
      : undefined,
  );
  const hasBooks = $derived(
    loaded !== undefined &&
      (loaded.series.items.length > 0 || (isListFiltered && !holdsNoSeries)),
  );
  const showsItemCounts = $derived(
    hasBooks && loaded?.view.showsItemCounts === true,
  );
  const countsSeries = $derived(showsItemCounts || isCountWanted);

  function listedBy(): LibraryListing {
    if (chosenListing === undefined) {
      throw new Error(
        "the library's series were asked for before their listing was read",
      );
    }
    return chosenListing;
  }

  function chooseListing(chosen: LibraryListing): void {
    listing.choose(chosen);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  $effect.pre(() => {
    if (library.list.kind === "loaded") {
      isListFiltered = untrack(
        () =>
          chosenListing !== undefined && filtersOn(chosenListing.filter) > 0,
      );
    }
  });

  $effect(() => {
    holdsNoSeries = false;
    if (!listsNothing || !isListFiltered) {
      return;
    }
    void commands
      .librarySeriesCount(DEFAULT_LIBRARY_LISTING.filter)
      .then((result) => {
        holdsNoSeries = result.status === "ok" && result.data === 0;
      });
  });

  $effect(() => {
    if (chosenListing === undefined) {
      return;
    }
    untrack(() => {
      void library.start();
    });
  });

  $effect(() => {
    if (chosenListing !== undefined && countsSeries) {
      untrack(() => {
        void seriesCount.load();
      });
    }
  });

  let measuredColumns: number | undefined = $state();
  const coversDrawn = $derived(
    library.list.kind === "failed" || loaded?.series.items.length === 0
      ? undefined
      : measuredColumns,
  );
  let emptyAddFolder: HTMLElement | null = $state(null);

  onMount(() => {
    void listing.load();
    void view.load();
    return listenForLibraryChanges(() => {
      if (chosenListing === undefined) {
        return;
      }
      void library.load();
      if (countsSeries) {
        void seriesCount.load();
      }
    }, reportError);
  });

  function returnFocusFromNotice(): void {
    if (isEmpty) {
      emptyAddFolder?.focus();
    } else {
      focusPageHeading();
    }
  }

  let offeredAddFolder = false;

  function keepFocusOnPageOnceAddFolderGoes(): void {
    if (
      offeredAddFolder &&
      !isEmpty &&
      document.activeElement === document.body
    ) {
      focusPageHeading();
    }
    offeredAddFolder = isEmpty;
  }

  $effect(keepFocusOnPageOnceAddFolderGoes);
</script>

{#snippet shownCount()}
  {#if seriesCount.count !== undefined}
    <SeriesCount count={seriesCount.count} />
  {/if}
{/snippet}

<CollectionHeading
  platform={data.appInfo.platform}
  title={m.library_title()}
  showsLabel={screenshotMode.showsLabel}
  count={showsItemCounts && seriesCount.count !== undefined
    ? shownCount
    : undefined}
>
  {#snippet actions()}
    {#if hasBooks && loaded !== undefined && chosenListing !== undefined}
      <LibrarySearchEntry platform={data.appInfo.platform} />
      <FilterAndSort
        listing={chosenListing}
        matching={seriesCount.count}
        onChoose={chooseListing}
        onOpen={() => {
          isCountWanted = true;
        }}
      />
      <ViewOptions
        view={loaded.view}
        {coversDrawn}
        onChoose={(chosen: LibraryView) => {
          view.choose(chosen);
        }}
      />
    {/if}
  {/snippet}
</CollectionHeading>
{#if isEmpty}
  <EmptyState
    icon={FolderOpen}
    title={m.library_empty()}
    body={m.library_empty_body()}
  >
    <div class="mbs-lg flex flex-col items-center gap-md max-inline-prose">
      <AddFolderButton
        bind:element={emptyAddFolder}
        {adding}
        placement="empty-state"
      />
      <FolderNotice
        {adding}
        {notices}
        usesStandIns={screenshotMode.isOn}
        onDismissed={returnFocusFromNotice}
      />
    </div>
  </EmptyState>
{:else if library.list.kind === "loading"}
  <div class="mbs-lg medium:mbs-xl">
    <CoverSkeletons
      {...view.reading.kind === "read"
        ? { coversPerRow: view.reading.value.coversPerRow }
        : {}}
    />
  </div>
{:else if library.list.kind === "failed"}
  <EmptyState
    icon={CircleAlert}
    title={m.library_series_failed()}
    body={m.library_unchanged()}
    role="alert"
  >
    <Button
      type="button"
      look="outline"
      class="mbs-lg flex items-center gap-sm rounded-shadcn-control px-lg font-medium min-block-touch-target desktop:text-label desktop:min-block-pointer-button"
      onclick={() => {
        void library.load();
      }}
    >
      <RefreshCw size={TRY_AGAIN_ICON_SIZE} aria-hidden="true" />
      {m.library_try_again()}
    </Button>
  </EmptyState>
{:else}
  <div class="mbs-sm">
    <FolderNotice
      {adding}
      {notices}
      usesStandIns={screenshotMode.isOn}
      onDismissed={returnFocusFromNotice}
    />
  </div>
  {#if listsNothing && chosenListing !== undefined}
    <NoMatches
      onClear={() => {
        chooseListing(withoutFilters(chosenListing));
      }}
    />
  {:else if loaded !== undefined}
    {#if loaded.view.showsContinueRow}
      <div class="mbs-lg medium:mbs-xl">
        <ContinueRow usesStandIns={screenshotMode.isOn} />
      </div>
    {/if}
    <div class="mbs-lg medium:mbs-xl">
      <SeriesCovers
        series={loaded.series.items}
        isComplete={loaded.series.isComplete}
        onNearEnd={() => {
          void library.loadMore();
        }}
        onColumns={(columns: number) => {
          measuredColumns = columns;
        }}
        {coverUrl}
        view={loaded.view}
        usesStandIns={screenshotMode.isOn}
      />
    </div>
  {/if}
{/if}
