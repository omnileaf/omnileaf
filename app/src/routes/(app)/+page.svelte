<script lang="ts">
  import { Channel } from "@tauri-apps/api/core";
  import { CircleAlert, FolderOpen, RefreshCw } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { assertNever } from "#lib/assert-never.ts";
  import {
    type AdultContent,
    commands,
    DEFAULT_LIBRARY_VIEW,
    type LibraryCategory,
    type LibraryFilterChoices,
    type LibraryFolder,
    type LibraryGrouping,
    type LibraryListing,
    type LibrarySeries,
    type LibraryTab as KeptTab,
    type LibraryView,
    type MissingFolder,
    type SeriesPage,
    type IpcError,
  } from "#lib/ipc/bindings.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import ActiveFilters from "#lib/library/ActiveFilters.svelte";
  import AddFolderButton from "#lib/library/AddFolderButton.svelte";
  import CategoryTabs from "#lib/library/CategoryTabs.svelte";
  import ChooseShareAgainSheet from "#lib/library/ChooseShareAgainSheet.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import FilterAndSort from "#lib/library/FilterAndSort.svelte";
  import LibraryMore from "#lib/library/LibraryMore.svelte";
  import { NEW_ADULT_CONTENT } from "#lib/library/adult-content.ts";
  import FilterPanel from "#lib/library/FilterPanel.svelte";
  import { FolderAdding } from "#lib/library/folder-adding.svelte.ts";
  import FolderNotice from "#lib/library/FolderNotice.svelte";
  import ContinueRow from "#lib/library/ContinueRow.svelte";
  import CoverSkeletons from "#lib/library/CoverSkeletons.svelte";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { MissingFolderNotices } from "#lib/library/missing-folder-notices.ts";
  import RemoveFolderDialog from "#lib/library/RemoveFolderDialog.svelte";
  import { rescanFolderWithProgress } from "#lib/library/rescan-folder.ts";
  import {
    filtersOn,
    withoutFilters,
    NEW_LIBRARY_LISTING,
    NO_FILTER_CHOICES,
  } from "#lib/library/library-listing.ts";
  import {
    librarySeriesList,
    type ListSeries,
  } from "#lib/library/library-series.svelte.ts";
  import {
    ALL_SERIES,
    LibraryTab,
    showsCategoryTabs,
  } from "#lib/library/library-tab.svelte.ts";
  import {
    arrangedTabs,
    NEW_LIBRARY_TABS,
    showsTabs,
    tabKey,
  } from "#lib/library/library-tabs.ts";
  import { LibrarySeriesCount } from "#lib/library/library-series-count.svelte.ts";
  import FastScroll from "#lib/library/FastScroll.svelte";
  import NoMatches from "#lib/library/NoMatches.svelte";
  import SeriesCount from "#lib/library/SeriesCount.svelte";
  import SeriesCovers from "#lib/library/SeriesCovers.svelte";
  import SeriesGroup from "#lib/library/SeriesGroup.svelte";
  import { StoredChoice } from "#lib/library/stored-choice.svelte.ts";
  import { swipesBetweenTabs } from "#lib/library/tab-swipe.ts";
  import LabelSeriesDialog from "#lib/library/LabelSeriesDialog.svelte";
  import EditDetailsDialog from "#lib/series/EditDetailsDialog.svelte";
  import type { EditedSeries } from "#lib/series/edited-series.ts";
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
  import { isPointer } from "#lib/page/platform.ts";
  import { getNeedsAttention } from "#lib/problems/needs-attention.svelte.ts";
  import NeedsAttentionDot from "#lib/problems/NeedsAttentionDot.svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { deviceKindOf } from "#lib/first-launch/device.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { shownListing } from "#lib/screenshot-mode/shown-listing.ts";
  import LibrarySearchEntry from "#lib/search/LibrarySearchEntry.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const TRY_AGAIN_ICON_SIZE = 16;
  const FILTER_PANEL_ID = "library-filter";
  const NOTHING_NEW: { status: "ok"; data: SeriesPage } = {
    status: "ok",
    data: { series: [], next: null },
  };
  const NONE_NEW = { status: "ok", data: 0 } as const;

  const screenshotMode = getScreenshotMode();
  const needsAttention = getNeedsAttention();
  const showsAttentionDot = $derived(
    !isPointer(data.appInfo.platform) && needsAttention.problems.length > 0,
  );
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
  const adultContent = new StoredChoice<AdultContent>(
    {
      read: () => commands.libraryAdultContent(),
      store: (chosen: AdultContent) => commands.setLibraryAdultContent(chosen),
      fallback: NEW_ADULT_CONTENT,
    },
    (error) => {
      reportError(error);
    },
  );
  const tab = new LibraryTab();
  let categories = $state<readonly LibraryCategory[]>([]);
  let keptTabs = $state<readonly KeptTab[]>(NEW_LIBRARY_TABS);
  const shownTabs = $derived(
    arrangedTabs(keptTabs, categories).filter(({ isHidden }) => !isHidden),
  );
  let filterChoices = $state<LibraryFilterChoices>(NO_FILTER_CHOICES);
  let folders = $state<readonly LibraryFolder[]>([]);
  const groupBy = $derived<LibraryGrouping>(
    view.reading.kind === "read" ? view.reading.value.groupBy : "none",
  );
  const groups = $derived(
    groupBy === "folder"
      ? folders.map((folder) => ({
          key: folder.id,
          name: folder.name,
          listSeries: (after: Parameters<ListSeries>[0]) =>
            commands.folderSeries(folder.id, after, listedBy()),
          countSeries: () =>
            commands.folderSeriesCount(folder.id, listedBy().filter),
        }))
      : groupBy === "category"
        ? categories.map((category) => ({
            key: category.id,
            name: category.name,
            listSeries: (after: Parameters<ListSeries>[0]) =>
              commands.categorySeries(category.id, after, listedBy()),
            countSeries: () =>
              commands.categorySeriesCount(category.id, listedBy().filter),
          }))
        : [],
  );
  const tabsShown = $derived(
    groupBy === "none" &&
      showsTabs(shownTabs) &&
      (view.reading.kind !== "read" || view.reading.value.showsCategoryTabs),
  );
  const chosenTab = $derived(
    tabsShown
      ? shownTabs.find(({ id }) => tabKey(id) === tab.chosen)?.id
      : undefined,
  );
  const chosenCategory = $derived(
    chosenTab?.kind === "category" ? chosenTab.id : undefined,
  );
  const isOnNewChapters = $derived(chosenTab?.kind === "newChapters");
  const chosenTabKey = $derived(
    chosenTab === undefined ? ALL_SERIES : tabKey(chosenTab),
  );
  const library = librarySeriesList((after) =>
    isOnNewChapters
      ? Promise.resolve(NOTHING_NEW)
      : chosenCategory === undefined
        ? commands.librarySeries(after, listedBy())
        : commands.categorySeries(chosenCategory, after, listedBy()),
  );
  const seriesCount = new LibrarySeriesCount(
    () =>
      isOnNewChapters
        ? Promise.resolve(NONE_NEW)
        : chosenCategory === undefined
          ? commands.librarySeriesCount(listedBy().filter)
          : commands.categorySeriesCount(chosenCategory, listedBy().filter),
    (error) => {
      reportError(error);
    },
  );
  const notices = getNotices();
  let hiddenSeries = $state(0);
  let unlinking = $state<LibraryFolder | undefined>();
  let choosingAgain = $state<MissingFolder | undefined>();
  let unlinkingBooks = $state<number | undefined>();
  const folderNotices = new MissingFolderNotices(notices, {
    showAnyway: ({ folder }) => {
      void commands
        .showMissingLibraryFolder(folder.id, true)
        .then(reportingErrors)
        .then(loadMissingFolders);
    },
    find: (missing) => {
      if (missing.problem.kind === "shareUnreachable") {
        choosingAgain = missing;
        return;
      }
      void relocate(missing);
    },
    unlink: ({ folder }) => {
      unlinking = folder;
      unlinkingBooks = undefined;
      void commands.libraryFolderBookCount(folder.id).then((books) => {
        unlinkingBooks = books.status === "ok" ? books.data : undefined;
      });
    },
    signIn: (missing) => {
      void signInTo(missing);
    },
    tryAgain: readAgain,
  });

  async function relocate(missing: MissingFolder): Promise<void> {
    const relocated = await commands.relocateLibraryFolder(
      missing.folder.id,
      new Channel(),
    );
    if (relocated.status === "error") {
      reportError(relocated.error);
    } else if (
      relocated.data !== null &&
      missing.problem.kind === "shareUnreachable"
    ) {
      if (relocated.data.outcome.kind === "unreachable") {
        folderNotices.stillFailing(missing);
      } else {
        folderNotices.back(missing);
      }
    }
    await loadMissingFolders();
  }

  async function signInTo(missing: MissingFolder): Promise<void> {
    const signedIn = await commands.signInToLibraryFolder(missing.folder.id);
    if (signedIn.status === "error") {
      reportError(signedIn.error);
      return;
    }
    switch (signedIn.data) {
      case "signedIn":
        folderNotices.back(missing);
        readAgain(missing);
        return;
      case "cancelled":
        return;
      case "failed":
        folderNotices.stillFailing(missing);
        return;
      default:
        assertNever(signedIn.data);
    }
  }

  function readAgain({ folder }: MissingFolder): void {
    void rescanFolderWithProgress(folder.id, () => undefined)
      .then(reportingErrors)
      .then(loadMissingFolders);
  }

  function reportingErrors(result: {
    readonly status: "ok" | "error";
    readonly error?: IpcError;
  }): void {
    if (result.status === "error" && result.error !== undefined) {
      reportError(result.error);
    }
  }

  async function loadMissingFolders(): Promise<void> {
    const [missing, hidden] = await Promise.all([
      commands.missingLibraryFolders(),
      commands.libraryHiddenSeriesCount(),
    ]);
    if (missing.status === "ok") {
      folderNotices.show(missing.data);
    }
    hiddenSeries = hidden.status === "ok" ? hidden.data : 0;
  }

  function showInFolder(series: LibrarySeries): void {
    void commands.showSeriesInFolder(series.id).then(reportingErrors);
  }

  async function unlink(folder: LibraryFolder): Promise<void> {
    unlinking = undefined;
    const removed = await commands.removeLibraryFolder(folder.id);
    reportingErrors(removed);
    await loadMissingFolders();
  }
  const selection = new Selection<SeriesId>();
  setSeriesSelection(selection);
  let keepsLabels = $state(false);
  let keepsDetailEdits = $state(false);
  let editedSeries = $state<EditedSeries | undefined>();

  function editDetails(series: LibrarySeries): void {
    editedSeries = {
      id: series.id,
      ...(screenshotMode.isOn ? standInLook : realLook)(series),
    };
  }
  let isLabelling = $state(false);
  let labelsFrom = $state<LabelsFrom>("categories");
  let labelled = $state<SeriesId[]>([]);

  function label(series: SeriesId[], from: LabelsFrom): void {
    labelled = series;
    labelsFrom = from;
    isLabelling = true;
  }
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
  const isListLong = $derived(
    loaded !== undefined && !loaded.series.isComplete,
  );
  const countsSeries = $derived(showsItemCounts || isCountWanted || isListLong);

  function letterAt(fraction: number): string | undefined {
    const total = seriesCount.count;
    if (loaded === undefined || total === undefined || total === 0) {
      return undefined;
    }
    const at = Math.min(total - 1, Math.floor(fraction * total));
    return loaded.series.items[at]?.title.trim().charAt(0).toLocaleUpperCase();
  }

  function listedBy(): LibraryListing {
    if (chosenListing === undefined) {
      throw new Error(
        "the library's series were asked for before their listing was read",
      );
    }
    return shownListing(chosenListing, screenshotMode.isOn);
  }

  function chooseListing(chosen: LibraryListing): void {
    listing.choose(chosen);
    document.querySelector("main")?.scrollTo({ top: 0 });
  }

  $effect.pre(() => {
    if (library.list.kind === "loaded") {
      isListFiltered = untrack(
        () =>
          (chosenTab !== undefined && chosenTab.kind !== "all") ||
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
      : {
          listing: shownListing(chosenListing, screenshotMode.isOn),
          tab: chosenTab,
        },
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

  async function loadFolders(): Promise<void> {
    const found: LibraryFolder[] = [];
    let after: Parameters<typeof commands.libraryFolders>[0] = null;
    do {
      const page = await commands.libraryFolders(after);
      if (page.status === "error") {
        return;
      }
      found.push(...page.data.folders);
      after = page.data.next;
    } while (after !== null);
    folders = found;
  }

  $effect(() => {
    if (groupBy === "folder") {
      void untrack(loadFolders);
    }
  });

  async function loadCategories(): Promise<void> {
    const kept = await commands.libraryCategories();
    if (kept.status === "ok") {
      categories = kept.data;
    }
  }

  async function loadTabs(): Promise<void> {
    const kept = await commands.libraryTabs();
    if (kept.status === "ok") {
      keptTabs = kept.data;
    }
  }

  async function loadLabelSupport(): Promise<void> {
    const labels = await commands.seriesLabels([]);
    if (labels.status === "ok") {
      keepsLabels = labels.data.keepsLabels;
    }
  }

  async function loadDetailEditSupport(): Promise<void> {
    keepsDetailEdits = await commands.keepsDetailEdits().catch(() => false);
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

  async function markRead(series: SeriesId[]): Promise<void> {
    const marked = await commands.markSeriesRead(series);
    if (marked.status !== "ok") {
      reportError(marked.error);
      return;
    }
    selection.end();
    notices.offerUndo({
      title: m.library_marked_read({ count: series.length }),
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
    const order = shownTabs.map(({ id }) => tabKey(id));
    const next = order[order.indexOf(chosenTabKey) + step];
    if (next !== undefined) {
      chooseTab(next);
    }
  }

  onMount(() => {
    void listing.load();
    void view.load();
    void adultContent.load();
    void loadCategories();
    void loadTabs();
    void loadFilterChoices();
    void loadLabelSupport();
    void loadDetailEditSupport();
    void loadMissingFolders();
    const stopListening = listenForLibraryChanges(() => {
      void loadMissingFolders();
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
    return () => {
      stopListening();
      folderNotices.withdrawAll();
    };
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

{#snippet attentionDot()}
  <NeedsAttentionDot
    count={needsAttention.problems.length}
    isOpen={needsAttention.isShown}
    onOpen={() => {
      needsAttention.show();
    }}
  />
{/snippet}

{#snippet shownCount()}
  {#if seriesCount.count !== undefined}
    <SeriesCount count={seriesCount.count} hidden={hiddenSeries} />
  {/if}
{/snippet}

<svelte:window onkeydown={keyWhileSelecting} />

<RemoveFolderDialog
  folder={unlinking}
  books={unlinkingBooks}
  onConfirm={(folder: LibraryFolder) => {
    void unlink(folder);
  }}
  onCancel={() => {
    unlinking = undefined;
  }}
/>

<ChooseShareAgainSheet
  choosing={choosingAgain?.problem.kind === "shareUnreachable"
    ? { name: choosingAgain.folder.name, share: choosingAgain.problem.share }
    : undefined}
  platform={data.appInfo.platform}
  onContinue={() => {
    const chosen = choosingAgain;
    choosingAgain = undefined;
    if (chosen !== undefined) {
      void relocate(chosen);
    }
  }}
  onClose={() => {
    choosingAgain = undefined;
  }}
/>

<LabelSeriesDialog
  bind:isOpen={isLabelling}
  series={labelled}
  startsAtTags={labelsFrom === "tags"}
  onError={reportError}
/>

<EditDetailsDialog
  series={editedSeries}
  {coverUrl}
  onClose={() => {
    editedSeries = undefined;
  }}
  onSaved={() => {
    editedSeries = undefined;
  }}
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
    attention={showsAttentionDot ? attentionDot : undefined}
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
        <LibraryMore
          {keepsLabels}
          onSelect={() => {
            selection.begin();
          }}
        />
      {/if}
    {/snippet}
  </CollectionHeading>
{/if}
<div
  bind:offsetHeight={headHeight}
  class="desktop-shell:sticky desktop-shell:inset-bs-under-toolbar desktop-shell:z-series-bar desktop-shell:-ms-gutter desktop-shell:-me-page-end desktop-shell:bg-background desktop-shell:ps-gutter desktop-shell:pe-page-end"
>
  {#if hasBooks && tabsShown && !selection.isSelecting}
    <CategoryTabs
      arranged={shownTabs}
      chosen={chosenTabKey}
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
          {#if groups.length > 0}
            {@const covers = {
              onColumns: (columns: number) => {
                measuredColumns = columns;
              },
              onMostThatFit: (most: number) => {
                mostThatFit = most;
              },
              coverUrl,
              view: loaded.view,
              usesStandIns: screenshotMode.isOn,
              adultTreatment:
                adultContent.reading.kind === "read"
                  ? adultContent.reading.value.treatment
                  : "show",
              menu: {
                canLabel: keepsLabels,
                canEditDetails: keepsDetailEdits,
                onEditDetails: editDetails,
                onMarkRead: (one: LibrarySeries) => {
                  void markRead([one.id]);
                },
                onLabel: (one: LibrarySeries) => {
                  label([one.id], "categories");
                },
                onSelect: (one: LibrarySeries) => {
                  selection.begin(one.id);
                },
                onShowInFolder: showInFolder,
              },
            }}
            <div class="flex flex-col gap-xl">
              {#each groups as group (group.key)}
                <SeriesGroup
                  name={group.name}
                  listSeries={group.listSeries}
                  countSeries={group.countSeries}
                  {listed}
                  {covers}
                />
              {/each}
            </div>
          {:else}
            <FastScroll total={seriesCount.count} {letterAt} />
            <SeriesCovers
              series={loaded.series.items}
              isComplete={loaded.series.isComplete}
              total={seriesCount.count}
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
              adultTreatment={adultContent.reading.kind === "read"
                ? adultContent.reading.value.treatment
                : "show"}
              menu={{
                canLabel: keepsLabels,
                canEditDetails: keepsDetailEdits,
                onEditDetails: editDetails,
                onMarkRead: (one: LibrarySeries) => {
                  void markRead([one.id]);
                },
                onLabel: (one: LibrarySeries) => {
                  label([one.id], "categories");
                },
                onSelect: (one: LibrarySeries) => {
                  selection.begin(one.id);
                },
                onShowInFolder: showInFolder,
              }}
            />
          {/if}
        </div>
        {#if selection.isSelecting && selection.count > 0}
          <LibrarySelectionActions
            count={selection.count}
            isPill={docksFilter}
            {keepsLabels}
            onLabels={(from: LabelsFrom) => {
              label(selection.picked, from);
            }}
            onMarkRead={() => {
              void markRead(selection.picked);
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
