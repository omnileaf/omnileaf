<script lang="ts">
  import { Channel } from "@tauri-apps/api/core";
  import {
    CircleAlert,
    FolderOpen,
    RefreshCw,
    TriangleAlert,
  } from "@lucide/svelte";
  import { onMount, type Snippet, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import { getAnimationsSetting } from "#lib/appearance/animations.svelte.ts";
  import { assertNever } from "#lib/assert-never.ts";
  import {
    type AdultContent,
    type AdultTreatment,
    commands,
    type LibraryCategory,
    type LibraryFilterChoices,
    type LibraryFolder,
    type LibraryGrouping,
    type LibraryListing,
    type LibrarySeries,
    type LibraryTab as KeptTab,
    type LibraryTabId,
    type LibraryView,
    type LibraryWriter,
    type MissingFolder,
    type IpcError,
    type RemovalTarget,
  } from "#lib/ipc/bindings.ts";
  import { readAllFolders } from "#lib/library/library-folders.svelte.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import ActiveFilters from "#lib/library/ActiveFilters.svelte";
  import AddFolderButton from "#lib/library/AddFolderButton.svelte";
  import { categorySource } from "#lib/library/category-source.svelte.ts";
  import CategoryTabs from "#lib/library/CategoryTabs.svelte";
  import FindFolderSheet from "#lib/library/FindFolderSheet.svelte";
  import { type CoverUrl, coverUrl } from "#lib/library/cover-url.ts";
  import type { SeriesMenuActions } from "#lib/library/series-menu.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import FilterAndSort from "#lib/library/FilterAndSort.svelte";
  import LibraryMore from "#lib/library/LibraryMore.svelte";
  import { NEW_ADULT_CONTENT } from "#lib/library/adult-content.ts";
  import FilterPanel from "#lib/library/FilterPanel.svelte";
  import { FolderAdding } from "#lib/library/folder-adding.svelte.ts";
  import FolderNotice from "#lib/library/FolderNotice.svelte";
  import ContinueRow from "#lib/library/ContinueRow.svelte";
  import CoverSkeletons from "#lib/library/CoverSkeletons.svelte";
  import {
    actionOffered,
    type EmptyAction,
    emptyCauseOf,
    keepsListChrome,
    narrowsLibrary,
  } from "#lib/library/empty-cause.ts";
  import EmptyTab from "#lib/library/EmptyTab.svelte";
  import { LibrarySeriesCount } from "#lib/library/library-series-count.svelte.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { defaultLibraryView, viewDrawn } from "#lib/library/library-view.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { FolderCardsPhone } from "#lib/library/folder-cards-phone.svelte.ts";
  import { FolderFinder } from "#lib/library/folder-finder.svelte.ts";
  import MissingFolderCard from "#lib/library/MissingFolderCard.svelte";
  import {
    dismissForThisVisit,
    isDismissedThisVisit,
    type MissingFolderActions,
    MissingFolderNotices,
  } from "#lib/library/missing-folder-notices.ts";
  import RemoveFolderDialog from "#lib/library/RemoveFolderDialog.svelte";
  import RemoveFromLibraryDialog from "#lib/library/RemoveFromLibraryDialog.svelte";
  import { noteRemoval, seriesTargets } from "#lib/library/removal-notice.ts";
  import { rescanFolderWithProgress } from "#lib/library/rescan-folder.ts";
  import {
    filtersOn,
    withoutFilters,
    NEW_LIBRARY_LISTING,
    NO_FILTER_CHOICES,
  } from "#lib/library/library-listing.ts";
  import type { ListSeries } from "#lib/library/library-series.svelte.ts";
  import {
    ALL_SERIES,
    LibraryTab,
    showsCategoryTabs,
  } from "#lib/library/library-tab.svelte.ts";
  import {
    type ArrangedTab,
    arrangedTabs,
    NEW_LIBRARY_TABS,
    showsTabs,
    tabKey,
  } from "#lib/library/library-tabs.ts";
  import { countOf, type TabPage } from "#lib/library/tab-page.svelte.ts";
  import { TabPages } from "#lib/library/tab-pages.svelte.ts";
  import FastScroll from "#lib/library/FastScroll.svelte";
  import NoMatches from "#lib/library/NoMatches.svelte";
  import SeriesCount from "#lib/library/SeriesCount.svelte";
  import SeriesCovers from "#lib/library/SeriesCovers.svelte";
  import SeriesGroup from "#lib/library/SeriesGroup.svelte";
  import { StoredChoice } from "#lib/library/stored-choice.svelte.ts";
  import { pagesAlong, swipesBetweenTabs } from "#lib/library/tab-swipe.ts";
  import LabelSeriesDialog from "#lib/library/LabelSeriesDialog.svelte";
  import EditDetailsDialog from "#lib/series/EditDetailsDialog.svelte";
  import type { EditedSeries } from "#lib/series/edited-series.ts";
  import MacSelectionActions from "#lib/library/MacSelectionActions.svelte";
  import IosLabelSeriesSheet from "#lib/library/IosLabelSeriesSheet.svelte";
  import IosSelectionActions from "#lib/library/IosSelectionActions.svelte";
  import LibrarySelectionActions from "#lib/library/LibrarySelectionActions.svelte";
  import LibrarySelectionHeader from "#lib/library/LibrarySelectionHeader.svelte";
  import { isNotConnected } from "#lib/library/not-connected.ts";
  import { selectionActions } from "#lib/library/selection-actions.ts";
  import {
    type LabelsFrom,
    setSeriesSelection,
  } from "#lib/library/series-selection.ts";
  import { Selection } from "#lib/page/selection.svelte.ts";
  import { endsOnBack } from "#lib/page/selection-back.svelte.ts";
  import type { SeriesId } from "#lib/series/series-id.ts";
  import ViewOptions from "#lib/library/ViewOptions.svelte";
  import type { ListState } from "#lib/paging/paged-list.svelte.ts";
  import { holdScrollTop } from "#lib/navigation/hold-scroll.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import { getNotices } from "#lib/notices/notices.ts";
  import { isPhone, isPointer, phoneOf } from "#lib/page/platform.ts";
  import { foldsBarActionsIntoMore } from "#lib/page/top-bar.ts";
  import { phoneAction } from "#lib/page/action-group.ts";
  import { commandBarLook } from "#lib/page/command-bar-look.ts";
  import { getNeedsAttention } from "#lib/problems/needs-attention.svelte.ts";
  import NeedsAttentionBarButton from "#lib/problems/NeedsAttentionBarButton.svelte";
  import NeedsAttentionDot from "#lib/problems/NeedsAttentionDot.svelte";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { reportFailure } from "#lib/errors/report-failure.ts";
  import { deviceKindOf } from "#lib/first-launch/device.ts";
  import {
    EXPANDED_QUERY,
    MAC_INSPECTOR_QUERY,
    WindowWidth,
  } from "#lib/page/breakpoints.ts";
  import { EMPTY_ACTION_GAP } from "#lib/page/empty-action.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import { shownListing } from "#lib/screenshot-mode/shown-listing.ts";
  import LibrarySearchEntry from "#lib/search/LibrarySearchEntry.svelte";

  import UpdateBanner from "#lib/updates/UpdateBanner.svelte";
  import {
    offersUpdateCheck,
    updateCheckForApp,
  } from "#lib/updates/update-check.svelte.ts";

  import type { PageProps } from "./$types";
  import LibraryWhatsNew from "#lib/whats-new/LibraryWhatsNew.svelte";

  let { data }: PageProps = $props();

  interface CoversLook {
    readonly coverUrl: CoverUrl;
    readonly view: LibraryView;
    readonly usesStandIns: boolean;
    readonly adultTreatment: AdultTreatment;
    readonly onColumns?: (columns: number) => void;
    readonly onMostThatFit?: (most: number) => void;
    readonly menu?: SeriesMenuActions;
  }

  const seriesGrid: Snippet<[TabPage, CoversLook]> = pageCovers;

  const TRY_AGAIN_ICON_SIZE = 16;
  const FILTER_PANEL_ID = "library-filter";
  const ALL_TAB: LibraryTabId = { kind: "all" };
  const BESIDE_PHONE_TABS = 1;
  const PAGE_STRIDE = "100% + var(--spacing-pager-gap)";
  const PAGE_INSET = "pe-page-end max-medium:ps-page-start medium:ps-gutter";
  const PAGE_BLEED = "-me-page-end max-medium:-ms-page-start medium:-ms-gutter";

  const animations = getAnimationsSetting();
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
      fallback: defaultLibraryView(untrack(() => data.appInfo.platform)),
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
  const androidPhone = new AndroidPhone();
  const groupBy = $derived<LibraryGrouping>(
    view.reading.kind === "read"
      ? viewDrawn(view.reading.value, androidPhone.isOn).groupBy
      : "none",
  );
  let writers = $state<readonly LibraryWriter[]>([]);
  const groups = $derived(groupsBy(groupBy));
  const tabsShown = $derived(
    groupBy === "none" &&
      showsTabs(shownTabs) &&
      (view.reading.kind !== "read" || view.reading.value.showsCategoryTabs),
  );
  const chosenArrangedTab = $derived(
    tabsShown
      ? shownTabs.find(({ id }) => tabKey(id) === tab.chosen)
      : undefined,
  );
  const chosenTab = $derived(chosenArrangedTab?.id);
  const chosenTabKey = $derived(
    chosenTab === undefined ? ALL_SERIES : tabKey(chosenTab),
  );
  const pages = new TabPages(listedBy, (error) => {
    reportError(error);
  });
  const chosenPage = $derived(pages.of(chosenTab ?? ALL_TAB));
  const pagerSlots = $derived.by(() => {
    const chosenAt = pages.held.findIndex(({ key }) => key === chosenTabKey);
    return pages.held.map(({ key, page }, at) => ({
      key,
      page,
      offset: at - chosenAt,
      scrolled: pages.scroll.recall(key),
    }));
  });
  const library = $derived(chosenPage.series);
  const seriesCount = $derived(chosenPage.count);
  const notices = getNotices();
  let hiddenSeries = $state(0);
  const folderCardsPhone = new FolderCardsPhone();
  let missingFolders = $state<readonly MissingFolder[]>([]);
  let stillFailing = $state<readonly string[]>([]);
  const cardedFolders = $derived(
    folderCardsPhone.isOn
      ? missingFolders.filter(({ folder }) => !isDismissedThisVisit(folder.id))
      : [],
  );
  let unlinking = $state<LibraryFolder | undefined>();
  let unlinkingBooks = $state<number | undefined>();
  const folderHandlers: MissingFolderActions = {
    showAnyway: ({ folder }) => {
      void commands
        .showMissingLibraryFolder(folder.id, true)
        .then(reportingErrors)
        .then(loadMissingFolders);
    },
    find: (missing) => {
      folderFinder.find(missing);
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
  };
  const folderNotices = new MissingFolderNotices(
    notices,
    folderHandlers,
    () => folderCardsPhone.isOn,
  );

  const folderFinder = new FolderFinder(
    ({ folder }) => commands.relocateLibraryFolder(folder.id, new Channel()),
    {
      onError: (error) => {
        reportError(error);
      },
      onShareStillUnreachable: (missing) => {
        folderNotices.stillFailing(missing);
        stillFailing = [...stillFailing, missing.folder.id];
      },
      onShareBack: (missing) => {
        folderNotices.back(missing);
        stillFailing = stillFailing.filter((id) => id !== missing.folder.id);
      },
      onSettled: loadMissingFolders,
    },
  );

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
        stillFailing = [...stillFailing, missing.folder.id];
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
      missingFolders = missing.data;
      folderNotices.show(missing.data);
    }
    hiddenSeries = hidden.status === "ok" ? hidden.data : 0;
  }

  function showInFolder(series: LibrarySeries): void {
    void commands.showSeriesInFolder(series.id).then(reportingErrors);
  }

  function showPickedInFolder(): void {
    for (const id of selection.picked) {
      void commands.showSeriesInFolder(id).then(reportingErrors);
    }
  }

  async function unlink(folder: LibraryFolder): Promise<void> {
    unlinking = undefined;
    const removed = await commands.removeLibraryFolder(folder.id);
    reportingErrors(removed);
    await loadMissingFolders();
  }
  const selection = new Selection<SeriesId>();
  endsOnBack(
    () => selection.isSelecting,
    () => {
      selection.end();
    },
  );
  const updateCheck = updateCheckForApp();
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
  const fitsInspector = new MediaQuery(MAC_INSPECTOR_QUERY);
  let isFilterOpen = $state(false);
  let filterButton: HTMLElement | null = $state(null);
  let isViewOpen = $state(false);
  let moreTrigger: HTMLElement | null = $state(null);
  const width = new WindowWidth();
  const pagesBesideChosen = $derived(
    tabsShown &&
      groups.length === 0 &&
      isPhone(data.appInfo.platform, width.current)
      ? BESIDE_PHONE_TABS
      : 0,
  );
  const isIosPhone = $derived(
    phoneOf(data.appInfo.platform, width.current) === "ios",
  );
  const showsAttentionInBar = $derived(isIosPhone || androidPhone.isOn);
  const isIos = $derived(data.appInfo.platform === "ios");
  const isMac = $derived(data.appInfo.platform === "macos");
  const docksFilter = $derived(
    (isMac ? fitsInspector.current : isExpanded.current) &&
      deviceKindOf(data.appInfo.platform) === "desktop",
  );
  const tryAgainPhone = $derived(
    phoneAction(data.appInfo.platform, width.current, "other"),
  );
  const foldsIntoMore = $derived(
    foldsBarActionsIntoMore(data.appInfo.platform),
  );
  let headHeight = $state(0);
  const commandsOnTop = $derived(
    commandBarLook(data.appInfo.platform) !== undefined,
  );
  function labelPicked(from: LabelsFrom): void {
    label(selection.picked, from);
  }

  function endSelecting(): void {
    selection.end();
  }

  function sayFailed(error: unknown, title: string): void {
    reportError(error);
    notices.show({
      tone: "warning",
      icon: TriangleAlert,
      title,
      body: m.library_action_failed_body(),
    });
  }

  function sayLabelsFailed(error: unknown): void {
    sayFailed(error, m.library_labels_failed());
  }

  function markPickedRead(): void {
    void markRead(selection.picked);
  }

  const actionsOnPicked = $derived(
    selectionActions({
      keepsLabels,
      onLabels: labelPicked,
      onMarkRead: markPickedRead,
    }),
  );
  const isDocked = $derived(docksFilter && isFilterOpen);
  const isGridBesidePanel = $derived(isDocked && !isMac);

  function closeFilterPanel(): void {
    isFilterOpen = false;
    filterButton?.focus();
  }

  const chosenListing = $derived(
    listing.reading.kind === "read" ? listing.reading.value : undefined,
  );
  let listedTab = $state.raw<ArrangedTab | undefined>();
  let isFilterOn = $state(false);
  const listedTabKey = $derived(
    listedTab === undefined ? ALL_SERIES : tabKey(listedTab.id),
  );

  const listsNothing = $derived(
    library.list.kind === "loaded" && library.list.items.length === 0,
  );
  const libraryCount = new LibrarySeriesCount(
    countOf(ALL_TAB, NEW_LIBRARY_LISTING),
    (error) => {
      reportError(error);
    },
  );
  const listedTabCount = new LibrarySeriesCount(
    () => countOf(listedTab?.id ?? ALL_TAB, NEW_LIBRARY_LISTING)(),
    (error) => {
      reportError(error);
    },
  );
  const emptyListCounts = [libraryCount, listedTabCount];
  const asksLibraryCount = $derived(
    listsNothing && narrowsLibrary({ listedTab, isFilterOn }),
  );
  const asksTabCount = $derived(listsNothing && listedTabKey !== ALL_SERIES);
  const emptyCause = $derived(
    listsNothing
      ? emptyCauseOf({
          listedTab,
          isFilterOn,
          libraryCount: libraryCount.reading,
          listedTabCount: listedTabCount.reading,
        })
      : undefined,
  );
  const isEmpty = $derived(emptyCause?.kind === "library");
  const libraryView = $derived(
    view.reading.kind === "read" ? view.reading.value : undefined,
  );
  const looks = $derived<CoversLook>({
    coverUrl,
    view: libraryView ?? defaultLibraryView(data.appInfo.platform),
    usesStandIns: screenshotMode.isOn,
    adultTreatment:
      adultContent.reading.kind === "read"
        ? adultContent.reading.value.treatment
        : "show",
  });
  const covers = $derived<CoversLook>({
    ...looks,
    onColumns: (columns: number) => {
      measuredColumns = columns;
    },
    onMostThatFit: (most: number) => {
      mostThatFit = most;
    },
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
      onRemove:
        data.appInfo.platform === "windows" || isMac
          ? (one: LibrarySeries) => {
              removing = seriesTargets([one.id]);
            }
          : undefined,
      picked: isMac
        ? {
            onMarkRead: markPickedRead,
            onLabel: () => {
              labelPicked("categories");
            },
            onShowInFolder: showPickedInFolder,
            onRemove: () => {
              removing = seriesTargets(selection.picked);
            },
          }
        : undefined,
    },
  });
  const loaded = $derived(
    library.list.kind === "loaded" && libraryView !== undefined
      ? { series: library.list, view: libraryView }
      : undefined,
  );
  const hasBooks = $derived(
    loaded !== undefined &&
      (loaded.series.items.length > 0 ||
        (emptyCause !== undefined && keepsListChrome(emptyCause))),
  );
  const offersTabs = $derived(hasBooks && tabsShown && !selection.isSelecting);
  const showsLibraryTools = $derived(
    library.list.kind !== "failed" && !isEmpty,
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

  let describedList: ListState<LibrarySeries> | undefined;

  $effect.pre(() => {
    const shown = library.list;
    if (shown.kind !== "loaded" || shown === describedList) {
      return;
    }
    describedList = shown;
    untrack(() => {
      listedTab = chosenArrangedTab;
      isFilterOn =
        chosenListing !== undefined && filtersOn(chosenListing.filter) > 0;
    });
  });

  function countOnlyWhileAsked(
    count: LibrarySeriesCount,
    isAsked: () => boolean,
  ): void {
    $effect.pre(() => {
      const asked = isAsked();
      untrack(() => {
        if (asked) {
          void count.load();
        } else {
          count.clear();
        }
      });
    });
  }

  countOnlyWhileAsked(libraryCount, () => asksLibraryCount);
  countOnlyWhileAsked(listedTabCount, () => asksTabCount);

  const listingShown = $derived(
    chosenListing === undefined
      ? undefined
      : shownListing(chosenListing, screenshotMode.isOn),
  );
  const listed = $derived(
    listingShown === undefined
      ? undefined
      : { listing: listingShown, tab: chosenTab },
  );

  $effect.pre(() => {
    if (listingShown === undefined) {
      return;
    }
    const showing = {
      basis: listingShown,
      tabs: shownTabs.map(({ id }) => id),
      chosen: chosenTab ?? ALL_TAB,
      reach: pagesBesideChosen,
    };
    untrack(() => {
      pages.show(showing);
    });
  });

  $effect(() => {
    if (listed !== undefined && countsSeries) {
      const { count } = chosenPage;
      untrack(() => {
        if (count.count === undefined && !count.isLoading) {
          void count.load();
        }
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

  interface Group {
    readonly key: string;
    readonly name: string;
    readonly creator?: string;
    readonly pointer?: string;
    readonly listSeries: ListSeries;
    readonly countSeries: () => ReturnType<typeof commands.librarySeriesCount>;
  }

  function groupsBy(grouping: LibraryGrouping): readonly Group[] {
    switch (grouping) {
      case "none":
        return [];
      case "folder":
        return folders.map((folder) => ({
          key: folder.id,
          name: folder.name,
          listSeries: (after) =>
            commands.folderSeries(folder.id, after, listedBy()),
          countSeries: () =>
            commands.folderSeriesCount(folder.id, listedBy().filter),
        }));
      case "category":
        return categories.map((category) => ({
          key: category.id,
          name: category.name,
          listSeries: (after) =>
            commands.categorySeries(category.id, after, listedBy()),
          countSeries: () =>
            commands.categorySeriesCount(category.id, listedBy().filter),
        }));
      case "creator":
        return [...writers.map(writerGroup), WRITERLESS_GROUP];
      default:
        return assertNever(grouping);
    }
  }

  function writerGroup({ name }: LibraryWriter): Group {
    return {
      key: `writer:${name}`,
      name,
      creator: name,
      listSeries: (after) => commands.writerSeries(name, after, listedBy()),
      countSeries: () => commands.writerSeriesCount(name, listedBy().filter),
    };
  }

  const WRITERLESS_GROUP: Group = {
    key: "writerless",
    name: m.library_group_no_creator(),
    pointer: m.library_group_no_creator_hint(),
    listSeries: (after) => commands.writerlessSeries(after, listedBy()),
    countSeries: () => commands.writerlessSeriesCount(listedBy().filter),
  };

  async function loadWriters(): Promise<void> {
    const found: LibraryWriter[] = [];
    let after: Parameters<typeof commands.libraryWriters>[0] = null;
    do {
      const page = await commands.libraryWriters(after);
      if (page.status === "error") {
        return;
      }
      found.push(...page.data.writers);
      after = page.data.next;
    } while (after !== null);
    writers = found;
  }

  async function loadFolders(): Promise<void> {
    folders = (await readAllFolders(commands.libraryFolders)) ?? folders;
  }

  $effect(() => {
    if (groupBy === "folder") {
      void untrack(loadFolders);
    }
    if (groupBy === "creator") {
      void untrack(loadWriters);
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

  let pager = $state<HTMLElement | null>(null);
  let stopHoldingScroll: (() => void) | undefined;
  $effect(() => () => stopHoldingScroll?.());

  function coversTopIn(main: HTMLElement): number {
    return pager === null
      ? 0
      : pager.getBoundingClientRect().top -
          main.getBoundingClientRect().top +
          main.scrollTop;
  }

  $effect(() => {
    if (isMac && tabsShown) {
      categorySource.publish(shownTabs, chosenTabKey, chooseTab);
    } else {
      categorySource.clear();
    }
    return () => {
      categorySource.clear();
    };
  });

  function chooseTab(chosen: string): void {
    const main = document.querySelector("main");
    stopHoldingScroll?.();
    if (main === null || pagesBesideChosen === 0) {
      tab.choose(chosen);
      main?.scrollTo({ top: 0 });
      return;
    }
    pages.scroll.remember(
      chosenTabKey,
      Math.max(0, main.scrollTop - coversTopIn(main)),
    );
    tab.choose(chosen);
    void tick().then(() => {
      const scrolled = pages.scroll.recall(chosen);
      stopHoldingScroll = holdScrollTop(
        main,
        scrolled === 0 ? 0 : coversTopIn(main) + scrolled,
      );
    });
  }

  function selectEverySeries(): void {
    if (loaded !== undefined) {
      selection.pickAll(
        loaded.series.items
          .filter((one) => !isNotConnected(one, data.appInfo.platform))
          .map(({ id }) => id),
      );
    }
  }

  let removing = $state<RemovalTarget[] | undefined>();
  const isAnotherSheetOpen = $derived(
    removing !== undefined ||
      unlinking !== undefined ||
      folderFinder.shareToChoose !== undefined ||
      isLabelling ||
      editedSeries !== undefined ||
      needsAttention.isShown ||
      isFilterOpen ||
      isViewOpen,
  );
  let isRemoving = $state(false);

  async function removeFromLibrary(deleteFiles: boolean): Promise<void> {
    if (removing === undefined) {
      return;
    }
    const targets = removing;
    isRemoving = true;
    const removed = await commands.removeFromLibrary(targets, deleteFiles);
    isRemoving = false;
    removing = undefined;
    if (removed.status !== "ok") {
      sayFailed(removed.error, m.library_remove_failed());
      return;
    }
    selection.end();
    noteRemoval(notices, removed.data);
    void library.load();
    if (countsSeries) {
      void seriesCount.load();
    }
    pages.refreshBeside();
  }

  async function markRead(series: SeriesId[]): Promise<void> {
    const marked = await commands.markSeriesRead(series);
    if (marked.status !== "ok") {
      sayFailed(marked.error, m.library_mark_read_failed());
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

  const KEEPS_SELECTION = "a, button, input, [role], [data-series-id], dialog";

  function clearOnEmptySpace(event: MouseEvent): void {
    if (
      isMac &&
      selection.isSelecting &&
      event.target instanceof Element &&
      event.target.closest(KEEPS_SELECTION) === null
    ) {
      selection.end();
    }
  }

  function tabBeside(step: 1 | -1): string | undefined {
    const order = shownTabs.map(({ id }) => tabKey(id));
    return order[order.indexOf(chosenTabKey) + step];
  }

  function swipeTab(step: 1 | -1): void {
    const next = tabBeside(step);
    if (next !== undefined) {
      chooseTab(next);
    }
  }

  async function chooseTagFromLink(): Promise<void> {
    await listing.load();
    const tag = page.state.libraryTag;
    if (tag === undefined || chosenListing === undefined) {
      return;
    }
    chooseListing({
      ...chosenListing,
      filter: { ...withoutFilters(chosenListing).filter, tags: [tag] },
    });
    await goto(resolve("/(app)"), { replaceState: true, state: {} });
  }

  onMount(() => {
    void chooseTagFromLink();
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
      for (const count of emptyListCounts) {
        if (count.reading.kind !== "counting") {
          void count.refresh();
        }
      }
      pages.refreshBeside();
    }, reportFailure);
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

  let offeredEmptyAction: EmptyAction | undefined;

  function keepFocusOnPageOnceEmptyActionChanges(): void {
    const offered = actionOffered(emptyCause, offeredEmptyAction);
    if (
      offeredEmptyAction !== undefined &&
      offered !== offeredEmptyAction &&
      document.activeElement === document.body
    ) {
      focusPageHeading();
    }
    offeredEmptyAction = offered;
  }

  $effect(keepFocusOnPageOnceEmptyActionChanges);
</script>

{#snippet pageCovers(page: TabPage, props: CoversLook)}
  {#if page.series.list.kind === "loaded"}
    <SeriesCovers
      series={page.series.list.items}
      isComplete={page.series.list.isComplete}
      total={page.count.count}
      onNearEnd={() => {
        void page.series.loadMore();
      }}
      {...props}
    />
  {:else if page.series.list.kind === "loading"}
    <CoverSkeletons coversPerRow={props.view.coversPerRow} />
  {/if}
{/snippet}

{#snippet attentionDot()}
  <NeedsAttentionDot
    count={needsAttention.problems.length}
    isOpen={needsAttention.isShown}
    onOpen={() => {
      needsAttention.show();
    }}
  />
{/snippet}

{#snippet attentionBarButton()}
  <NeedsAttentionBarButton
    count={needsAttention.problems.length}
    isOpen={needsAttention.isShown}
    onOpen={() => {
      needsAttention.show();
    }}
  />
{/snippet}

{#snippet pickedCount()}
  {m.library_selected_of({
    count: selection.count,
    total: seriesCount.count ?? selection.count,
  })}
{/snippet}

{#snippet shownCount()}
  {#if seriesCount.count !== undefined}
    <SeriesCount
      count={seriesCount.count}
      hidden={hiddenSeries}
      groupBy={androidPhone.isOn ? groupBy : "none"}
    />
  {/if}
{/snippet}

<svelte:window onkeydown={keyWhileSelecting} onclick={clearOnEmptySpace} />

<RemoveFromLibraryDialog
  targets={removing}
  isBusy={isRemoving}
  onConfirm={(deleteFiles: boolean) => {
    void removeFromLibrary(deleteFiles);
  }}
  onCancel={() => {
    removing = undefined;
  }}
/>

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

<FindFolderSheet finder={folderFinder} platform={data.appInfo.platform} />

{#if isIosPhone}
  <IosLabelSeriesSheet
    bind:isOpen={isLabelling}
    series={labelled}
    from={labelsFrom}
    onApplied={endSelecting}
    onApplyFailed={sayLabelsFailed}
    onError={reportFailure}
  />
{:else}
  <LabelSeriesDialog
    bind:isOpen={isLabelling}
    series={labelled}
    from={labelsFrom}
    onApplied={endSelecting}
    onApplyFailed={sayLabelsFailed}
    onError={reportFailure}
  />
{/if}

<LibraryWhatsNew
  platform={data.appInfo.platform}
  installed={data.appInfo.version}
  isLibraryBusy={selection.isSelecting || isAnotherSheetOpen}
/>

<EditDetailsDialog
  series={editedSeries}
  platform={data.appInfo.platform}
  {coverUrl}
  onClose={() => {
    editedSeries = undefined;
  }}
  onSaved={() => {
    editedSeries = undefined;
  }}
  onError={reportFailure}
/>

{#if selection.isSelecting && !isMac}
  <LibrarySelectionHeader
    platform={data.appInfo.platform}
    count={selection.count}
    onSelectAll={selectEverySeries}
    onCancel={() => {
      selection.end();
    }}
    actions={commandsOnTop ? actionsOnPicked : []}
  />
{:else}
  <CollectionHeading
    platform={data.appInfo.platform}
    title={m.library_title()}
    showsLabel={screenshotMode.showsLabel}
    stacksCount
    attention={showsAttentionDot && !showsAttentionInBar
      ? attentionDot
      : undefined}
    leading={showsAttentionDot && isIosPhone ? attentionBarButton : undefined}
    count={isMac && selection.isSelecting
      ? pickedCount
      : showsItemCounts && seriesCount.count !== undefined
        ? shownCount
        : undefined}
  >
    {#snippet actions()}
      {#if isMac && selection.isSelecting && selection.count > 0}
        <MacSelectionActions
          actions={actionsOnPicked}
          onDelete={() => {
            removing = seriesTargets(selection.picked);
          }}
        />
      {/if}
      {#if showsLibraryTools && libraryView !== undefined && chosenListing !== undefined}
        {#if showsAttentionDot && androidPhone.isOn}
          <NeedsAttentionDot
            count={needsAttention.problems.length}
            isOpen={needsAttention.isShown}
            onOpen={() => {
              needsAttention.show();
            }}
          />
        {/if}
        {#if !isMac}
          <LibrarySearchEntry platform={data.appInfo.platform} />
        {/if}
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
          showsButton={!foldsIntoMore}
          returnFocusTo={moreTrigger}
        />
        <ViewOptions
          view={libraryView}
          {coversDrawn}
          {mostThatFit}
          hasCategories={showsCategoryTabs(categories)}
          onChoose={(chosen: LibraryView) => {
            view.choose(chosen);
          }}
          bind:isOpen={isViewOpen}
          showsButton={!foldsIntoMore}
          returnFocusTo={moreTrigger}
        />
        {#if isMac}
          <LibrarySearchEntry platform={data.appInfo.platform} />
        {/if}
        <LibraryMore
          bind:trigger={moreTrigger}
          folded={foldsIntoMore
            ? {
                filtersCount: filtersOn(chosenListing.filter),
                onSortAndFilter: () => {
                  isFilterOpen = true;
                  isCountWanted = true;
                },
                onViewOptions: () => {
                  isViewOpen = true;
                },
              }
            : undefined}
          {keepsLabels}
          onSelect={() => {
            selection.begin();
          }}
        />
      {/if}
    {/snippet}
  </CollectionHeading>
{/if}
{#if offersUpdateCheck(data.appInfo) && updateCheck.shownRelease !== undefined && hasBooks && !selection.isSelecting}
  <UpdateBanner
    checking={updateCheck}
    release={updateCheck.shownRelease}
    class="mbe-sm"
  />
{/if}
<div
  bind:offsetHeight={headHeight}
  class="desktop-shell:sticky desktop-shell:inset-bs-under-toolbar desktop-shell:z-series-bar desktop-shell:-ms-gutter desktop-shell:-me-page-end desktop-shell:bg-background desktop-shell:ps-gutter desktop-shell:pe-page-end"
>
  {#if offersTabs && !isMac}
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
  class={isGridBesidePanel
    ? "-me-page-end -mbe-page-bottom grid grid-cols-docked-panel"
    : "flex flex-1 flex-col"}
>
  <div
    {@attach offersTabs &&
      swipesBetweenTabs({
        onSwipe: swipeTab,
        canStep: (step) => tabBeside(step) !== undefined,
        settlesSmoothly: () =>
          pagesBesideChosen > 0 && animations.moves("navigation"),
        track: () => pager,
        stride: PAGE_STRIDE,
      })}
    class={[
      "flex flex-1 flex-col",
      offersTabs && "touch-pan-y",
      isGridBesidePanel && "pe-page-end pbe-page-bottom min-inline-none",
    ]}
  >
    {#if isEmpty}
      <EmptyState
        icon={FolderOpen}
        title={m.library_empty()}
        body={m.library_empty_body()}
      >
        <div
          class="{EMPTY_ACTION_GAP} flex flex-col items-center gap-md max-inline-prose"
        >
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
          {...tryAgainPhone === undefined
            ? { look: "outline" }
            : { variant: tryAgainPhone.variant, size: tryAgainPhone.size }}
          class={[
            EMPTY_ACTION_GAP,
            "flex items-center gap-sm",
            tryAgainPhone === undefined
              ? "rounded-shadcn-button px-lg font-medium min-block-touch-target desktop:text-label desktop:min-block-pointer-button"
              : tryAgainPhone.fit,
          ]}
          onclick={() => {
            void library.load();
          }}
        >
          <RefreshCw size={TRY_AGAIN_ICON_SIZE} aria-hidden="true" />
          {m.library_try_again()}
        </Button>
      </EmptyState>
    {:else}
      {#each cardedFolders as card (card.folder.id)}
        <div class="mbs-sm ios:mbs-none">
          <MissingFolderCard
            missing={card}
            isStillFailing={stillFailing.includes(card.folder.id)}
            handlers={folderHandlers}
            onHide={({ folder }: MissingFolder) => {
              void commands
                .showMissingLibraryFolder(folder.id, false)
                .then(reportingErrors)
                .then(loadMissingFolders);
            }}
            onDismiss={({ folder }: MissingFolder) => {
              dismissForThisVisit(folder.id);
              missingFolders = [...missingFolders];
            }}
          />
        </div>
      {/each}
      <FolderNotice
        class="mbs-sm"
        {adding}
        {notices}
        usesStandIns={screenshotMode.isOn}
        onDismissed={returnFocusFromNotice}
      />
      {#if emptyCause?.kind === "tab"}
        <EmptyTab
          tab={emptyCause.tab}
          onGoToAll={() => {
            chooseTab(ALL_SERIES);
          }}
        />
      {:else if emptyCause?.kind === "filters" && chosenListing !== undefined}
        <NoMatches
          filter={chosenListing.filter}
          onClear={() => {
            chooseListing(withoutFilters(chosenListing));
          }}
        />
      {:else if loaded !== undefined && emptyCause?.kind !== "counting"}
        {#if loaded.view.showsContinueRow}
          <div class="mbs-lg medium:mbs-xl">
            <ContinueRow usesStandIns={screenshotMode.isOn} />
          </div>
        {/if}
        <div
          class={[
            PAGE_BLEED,
            "mbs-lg flex flex-1 flex-col overflow-x-clip medium:mbs-xl",
          ]}
        >
          <div bind:this={pager} class="relative flex-1">
            {#if groups.length > 0}
              <div
                class={[
                  PAGE_INSET,
                  "flex flex-col gap-xl android:max-medium:gap-sm",
                ]}
              >
                {#each groups as group (group.key)}
                  <SeriesGroup
                    name={group.name}
                    creator={group.creator}
                    pointer={group.pointer}
                    listSeries={group.listSeries}
                    countSeries={group.countSeries}
                    {listed}
                    {covers}
                  />
                {/each}
              </div>
            {:else if pagesBesideChosen > 0}
              {#each pagerSlots as slot (slot.key)}
                {@const isChosen = slot.offset === 0}
                <div
                  inert={!isChosen}
                  aria-hidden={isChosen ? undefined : "true"}
                  data-pager-page={isChosen ? "chosen" : "beside"}
                  class={isChosen
                    ? "relative"
                    : "invisible absolute inset-bs-none overflow-clip block-full inline-full in-data-swiping:visible"}
                  style:inset-inline-start={isChosen
                    ? undefined
                    : pagesAlong(slot.offset, PAGE_STRIDE)}
                >
                  <div
                    class={isChosen
                      ? undefined
                      : "sticky inset-bs-none overflow-clip block-dvh"}
                  >
                    <div
                      class={PAGE_INSET}
                      style:translate={isChosen
                        ? undefined
                        : `0 -${String(slot.scrolled)}px`}
                    >
                      {#if isChosen}
                        <FastScroll total={seriesCount.count} {letterAt} />
                      {/if}
                      {@render seriesGrid(slot.page, isChosen ? covers : looks)}
                    </div>
                  </div>
                </div>
              {/each}
            {:else}
              <div class={PAGE_INSET}>
                <FastScroll total={seriesCount.count} {letterAt} />
                {@render seriesGrid(chosenPage, covers)}
              </div>
            {/if}
          </div>
        </div>
        {#if selection.isSelecting && (selection.count > 0 || androidPhone.isOn) && !commandsOnTop && !isMac}
          {#if isIos}
            <IosSelectionActions
              {keepsLabels}
              isSpread={isIosPhone}
              onLabels={labelPicked}
              onMarkRead={markPickedRead}
              onDelete={() => {
                removing = seriesTargets(selection.picked);
              }}
            />
          {:else}
            <LibrarySelectionActions
              count={selection.count}
              isPill={docksFilter}
              {keepsLabels}
              onLabels={labelPicked}
              onMarkRead={markPickedRead}
              onDelete={() => {
                removing = seriesTargets(selection.picked);
              }}
              onCancel={() => {
                selection.end();
              }}
            />
          {/if}
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
