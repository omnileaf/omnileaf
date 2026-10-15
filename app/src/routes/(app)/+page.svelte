<script lang="ts">
  import { CircleAlert, FolderOpen, RefreshCw } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import {
    commands,
    DEFAULT_LIBRARY_VIEW,
    type LibraryCategory,
    type LibraryFilterChoices,
    type LibraryListing,
    type LibraryView,
  } from "#lib/ipc/bindings.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import ActiveFilters from "#lib/library/ActiveFilters.svelte";
  import AddFolderButton from "#lib/library/AddFolderButton.svelte";
  import CategoryTabs from "#lib/library/CategoryTabs.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import FilterAndSort from "#lib/library/FilterAndSort.svelte";
  import FilterPanel from "#lib/library/FilterPanel.svelte";
  import { FolderAdding } from "#lib/library/folder-adding.svelte.ts";
  import FolderNotice from "#lib/library/FolderNotice.svelte";
  import ContinueRow from "#lib/library/ContinueRow.svelte";
  import CoverSkeletons from "#lib/library/CoverSkeletons.svelte";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import {
    filtersOn,
    withoutFilters,
    NEW_LIBRARY_LISTING,
    NO_FILTER_CHOICES,
  } from "#lib/library/library-listing.ts";
  import { librarySeriesList } from "#lib/library/library-series.svelte.ts";
  import {
    ALL_SERIES,
    categoryOf,
    LibraryTab,
    showsCategoryTabs,
  } from "#lib/library/library-tab.svelte.ts";
  import { LibrarySeriesCount } from "#lib/library/library-series-count.svelte.ts";
  import NoMatches from "#lib/library/NoMatches.svelte";
  import SeriesCount from "#lib/library/SeriesCount.svelte";
  import SeriesCovers from "#lib/library/SeriesCovers.svelte";
  import { StoredChoice } from "#lib/library/stored-choice.svelte.ts";
  import { swipesBetweenTabs } from "#lib/library/tab-swipe.ts";
  import LabelSeriesDialog from "#lib/library/LabelSeriesDialog.svelte";
  import LibrarySelectionActions from "#lib/library/LibrarySelectionActions.svelte";
  import LibrarySelectionHeader from "#lib/library/LibrarySelectionHeader.svelte";
  import {
    type LabelsFrom,
    setSeriesSelection,
  } from "#lib/library/series-selection.ts";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import type { SeriesId } from "#lib/series/series-id.ts";
  import ViewOptions from "#lib/library/ViewOptions.svelte";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { deviceKindOf } from "#lib/first-launch/device.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import LibrarySearchEntry from "#lib/search/LibrarySearchEntry.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const TRY_AGAIN_ICON_SIZE = 16;
  const FILTER_PANEL_ID = "library-filter";

  const screenshotMode = getScreenshotMode();
  const listing = new StoredChoice<LibraryListing>(
    {
      read: () => commands.libraryListing(),
      store: (chosen: LibraryListing) => commands.setLibraryListing(chosen),
      fallback: NEW_LIBRARY_LISTING,
    },
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
  const tab = new LibraryTab();
  let categories = $state<readonly LibraryCategory[]>([]);
  let filterChoices = $state<LibraryFilterChoices>(NO_FILTER_CHOICES);
  const tabsShown = $derived(
    showsCategoryTabs(categories) &&
      (view.reading.kind !== "read" || view.reading.value.showsCategoryTabs),
  );
  const chosenCategory = $derived(
    categoryOf(tab.chosen, tabsShown ? categories : []),
  );
  const library = librarySeriesList((after) =>
    chosenCategory === undefined
      ? commands.librarySeries(after, listedBy())
      : commands.categorySeries(chosenCategory, after, listedBy()),
  );
  const seriesCount = new LibrarySeriesCount(
    () =>
      chosenCategory === undefined
        ? commands.librarySeriesCount(listedBy().filter)
        : commands.categorySeriesCount(chosenCategory, listedBy().filter),
    (error) => {
      reportError(error);
    },
  );
  const notices = getNotices();
  const selection = new Selection<SeriesId>();
  setSeriesSelection(selection);
  let keepsLabels = $state(false);
  let isLabelling = $state(false);
  let labelsFrom = $state<LabelsFrom>("categories");
  const adding = new FolderAdding(addFolderWithProgress, () => notices);

  let isCountWanted = $state(false);
  const isExpanded = new MediaQuery(EXPANDED_QUERY);
  const docksFilter = $derived(
    isExpanded.current && deviceKindOf(data.appInfo.platform) === "desktop",
  );
  let isFilterOpen = $state(false);
  let filterButton: HTMLElement | null = $state(null);
  let headHeight = $state(0);
  const isDocked = $derived(docksFilter && isFilterOpen);

  function closeFilterPanel(): void {
    isFilterOpen = false;
    filterButton?.focus();
  }

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
          chosenCategory !== undefined ||
          (chosenListing !== undefined && filtersOn(chosenListing.filter) > 0),
      );
    }
  });

  $effect(() => {
    holdsNoSeries = false;
    if (!listsNothing || !isListFiltered) {
      return;
    }
    void commands
      .librarySeriesCount(NEW_LIBRARY_LISTING.filter)
      .then((result) => {
        holdsNoSeries = result.status === "ok" && result.data === 0;
      });
  });

  const listed = $derived(
    chosenListing === undefined
      ? undefined
      : { listing: chosenListing, category: chosenCategory },
  );

  $effect(() => {
    if (listed === undefined) {
      return;
    }
    untrack(() => {
      void library.start();
    });
  });

  $effect(() => {
    if (listed !== undefined && countsSeries) {
      untrack(() => {
        void seriesCount.load();
      });
    }
  });

  let measuredColumns: number | undefined = $state();
  let mostThatFit: number | undefined = $state();
  const coversDrawn = $derived(
    library.list.kind === "failed" || loaded?.series.items.length === 0
      ? undefined
      : measuredColumns,
  );
  let emptyAddFolder: HTMLElement | null = $state(null);

  async function loadCategories(): Promise<void> {
    const kept = await commands.libraryCategories();
    if (kept.status === "ok") {
      categories = kept.data;
    }
  }

  async function loadLabelSupport(): Promise<void> {
    const labels = await commands.seriesLabels([]);
    if (labels.status === "ok") {
      keepsLabels = labels.data.keepsLabels;
    }
  }

  async function loadFilterChoices(): Promise<void> {
    const offered = await commands.libraryFilterChoices();
    if (offered.status === "ok") {
      filterChoices = offered.data;
    }
  }

  function chooseTab(chosen: string): void {
    tab.choose(chosen);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  function selectEverySeries(): void {
    if (loaded !== undefined) {
      selection.pickAll(loaded.series.items.map(({ id }) => id));
    }
  }

  async function markSelectedRead(): Promise<void> {
    const picked = selection.picked;
    const marked = await commands.markSeriesRead(picked);
    if (marked.status !== "ok") {
      reportError(marked.error);
      return;
    }
    selection.end();
    notices.offerUndo({
      title: m.library_marked_read({ count: picked.length }),
      undo: () => {
        void commands.markBooks(marked.data, "unread");
      },
    });
  }

  function keyWhileSelecting(event: KeyboardEvent): void {
    if (!selection.isSelecting || event.defaultPrevented) {
      return;
    }
    if (event.key === "Escape") {
      selection.end();
      return;
    }
    if (event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      selectEverySeries();
    }
  }

  function swipeTab(step: 1 | -1): void {
    const order = [ALL_SERIES, ...categories.map(({ id }) => id)];
    const next = order[order.indexOf(chosenCategory ?? ALL_SERIES) + step];
    if (next !== undefined) {
      chooseTab(next);
    }
  }

  onMount(() => {
    void listing.load();
    void view.load();
    void loadCategories();
    void loadFilterChoices();
    void loadLabelSupport();
    return listenForLibraryChanges(() => {
      void loadCategories();
      void loadFilterChoices();
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

<svelte:window onkeydown={keyWhileSelecting} />

<LabelSeriesDialog
  bind:isOpen={isLabelling}
  series={selection.picked}
  startsAtTags={labelsFrom === "tags"}
  onError={reportError}
/>

{#if selection.isSelecting}
  <LibrarySelectionHeader
    platform={data.appInfo.platform}
    count={selection.count}
    onSelectAll={selectEverySeries}
    onCancel={() => {
      selection.end();
    }}
  />
{:else}
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
          bind:isOpen={isFilterOpen}
          bind:button={filterButton}
          docks={docksFilter}
          panelId={FILTER_PANEL_ID}
          choices={filterChoices}
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
          {mostThatFit}
          hasCategories={showsCategoryTabs(categories)}
          onChoose={(chosen: LibraryView) => {
            view.choose(chosen);
          }}
        />
      {/if}
    {/snippet}
  </CollectionHeading>
{/if}
<div
  bind:offsetHeight={headHeight}
  class="desktop:expanded:sticky desktop:expanded:inset-bs-under-toolbar desktop:expanded:z-series-bar desktop:expanded:-ms-gutter desktop:expanded:-me-page-end desktop:expanded:bg-background desktop:expanded:ps-gutter desktop:expanded:pe-page-end"
>
  {#if hasBooks && tabsShown && !selection.isSelecting}
    <CategoryTabs
      {categories}
      chosen={chosenCategory ?? ALL_SERIES}
      onChoose={chooseTab}
    />
  {/if}
  {#if hasBooks && chosenListing !== undefined && filtersOn(chosenListing.filter) > 0 && !isDocked && !selection.isSelecting}
    <ActiveFilters
      listing={chosenListing}
      onChoose={chooseListing}
      onMore={() => {
        isCountWanted = true;
        isFilterOpen = true;
      }}
    />
  {/if}
</div>
<div
  class={isDocked
    ? "-me-page-end -mbe-page-bottom grid grid-cols-docked-panel"
    : "flex flex-1 flex-col"}
>
  <div
    class={[
      "flex flex-1 flex-col",
      isDocked && "pe-page-end pbe-page-bottom min-inline-none",
    ]}
  >
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
          filter={chosenListing.filter}
          onClear={() => {
            chooseTab(ALL_SERIES);
            chooseListing(withoutFilters(chosenListing));
          }}
        />
      {:else if loaded !== undefined}
        {#if loaded.view.showsContinueRow}
          <div class="mbs-lg medium:mbs-xl">
            <ContinueRow usesStandIns={screenshotMode.isOn} />
          </div>
        {/if}
        <div
          {@attach tabsShown && swipesBetweenTabs(swipeTab)}
          class="mbs-lg touch-pan-y medium:mbs-xl"
        >
          <SeriesCovers
            series={loaded.series.items}
            isComplete={loaded.series.isComplete}
            onNearEnd={() => {
              void library.loadMore();
            }}
            onColumns={(columns: number) => {
              measuredColumns = columns;
            }}
            onMostThatFit={(most: number) => {
              mostThatFit = most;
            }}
            {coverUrl}
            view={loaded.view}
            usesStandIns={screenshotMode.isOn}
          />
        </div>
        {#if selection.isSelecting && selection.count > 0}
          <LibrarySelectionActions
            count={selection.count}
            isPill={docksFilter}
            {keepsLabels}
            onLabels={(from: LabelsFrom) => {
              labelsFrom = from;
              isLabelling = true;
            }}
            onMarkRead={() => {
              void markSelectedRead();
            }}
            onCancel={() => {
              selection.end();
            }}
          />
        {/if}
      {/if}
    {/if}
  </div>
  {#if isDocked && chosenListing !== undefined}
    <FilterPanel
      id={FILTER_PANEL_ID}
      choices={filterChoices}
      listing={chosenListing}
      matching={seriesCount.count}
      {headHeight}
      onChoose={chooseListing}
      onClose={closeFilterPanel}
    />
  {/if}
</div>
