<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { goto, preloadCode } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import AppKeyboardShortcuts from "#lib/keyboard/AppKeyboardShortcuts.svelte";
  import { commands, type HomeArrival } from "#lib/ipc/bindings.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import {
    homeArrivalNotice,
    takeHomeArrival,
  } from "#lib/library/home-arrival.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import { LibraryFolders } from "#lib/library/library-folders.svelte.ts";
  import {
    setTapOpenTabSetting,
    tapOpenTabSettingForDocument,
  } from "#lib/navigation/tap-open-tab.svelte.ts";
  import { getAnimationsSetting } from "#lib/appearance/animations.svelte.ts";
  import { reportFailure } from "#lib/errors/report-failure.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import AppNavigation from "#lib/navigation/AppNavigation.svelte";
  import { openTabTap } from "#lib/navigation/open-tab-tap.ts";
  import { makeBackGoUp, setBackGoesUp } from "#lib/navigation/back-goes-up.ts";
  import {
    isPaneToggledBy,
    PANE_SHORTCUT,
  } from "#lib/navigation/pane-shortcut.ts";
  import {
    isSectionRoot,
    sectionOf,
    showsTopTabBar,
  } from "#lib/navigation/sections.ts";
  import {
    setSidebarSetting,
    sidebarSettingForDocument,
  } from "#lib/navigation/sidebar.svelte.ts";
  import SwipeableMain from "#lib/navigation/SwipeableMain.svelte";
  import { focusedTabHref, focusTab } from "#lib/navigation/tab-focus.ts";
  import TopTabBar from "#lib/navigation/TopTabBar.svelte";
  import { getNotices } from "#lib/notices/notices.ts";
  import Toasts from "#lib/notices/Toasts.svelte";
  import FindFolderSheet from "#lib/library/FindFolderSheet.svelte";
  import { noticingFolderFinder } from "#lib/library/noticing-folder-finder.ts";
  import { fixProblem } from "#lib/problems/fix-problem.ts";
  import {
    NeedsAttention,
    type Problem,
    setNeedsAttention,
  } from "#lib/problems/needs-attention.svelte.ts";
  import NeedsAttentionSheet from "#lib/problems/NeedsAttentionSheet.svelte";
  import NeedsAttentionSidebarItem from "#lib/problems/NeedsAttentionSidebarItem.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import ScreenshotModeNotice from "#lib/screenshot-mode/ScreenshotModeNotice.svelte";
  import QuickOpen from "#lib/search/QuickOpen.svelte";
  import { SEARCH_ROUTE_ID } from "#lib/search/search-route.ts";
  import {
    setStorageCheck,
    StorageCheck,
  } from "#lib/storage/storage-check.svelte.ts";
  import { QuickOpenState } from "#lib/search/quick-open-state.svelte.ts";
  import { shownBackLink } from "#lib/navigation/back-link.ts";
  import { paneFoldQuery, WindowWidth } from "#lib/page/breakpoints.ts";
  import {
    hasTopTabBar,
    isPhone,
    isPointer,
    phoneOf,
    usesCommandKey,
  } from "#lib/page/platform.ts";
  import { READER_ROUTE_ID } from "#lib/reader/reader-route.ts";
  import { deviceWordOf } from "#lib/storage/device.ts";
  import LowSpaceNotice from "#lib/storage/LowSpaceNotice.svelte";
  import { type Shortcut, shortcut } from "#lib/shortcut.ts";
  import {
    offersUpdateCheck,
    updateCheckForApp,
  } from "#lib/updates/update-check.svelte.ts";
  import {
    noticeWords,
    updateNoticesForApp,
  } from "#lib/updates/update-notices.svelte.ts";

  import type { LayoutProps } from "./$types";

  const EDIT_DETAILS_ROUTE = "/(app)/series/[id]/edit";

  let { children, data }: LayoutProps = $props();

  const language = getLanguageSetting();
  const notices = getNotices();
  const theme = getThemeSetting();
  const screenshotMode = getScreenshotMode();
  const backGoesUp = setBackGoesUp(makeBackGoUp());
  const quickOpen = new QuickOpenState();
  const sidebar = setSidebarSetting(sidebarSettingForDocument());
  const tapOpenTab = setTapOpenTabSetting(tapOpenTabSettingForDocument());
  const animations = getAnimationsSetting();
  const androidPhone = new AndroidPhone();

  function tapOpenSection(event: MouseEvent): void {
    const main = document.querySelector("main");
    const tap = openTabTap({
      isTurnedOn: tapOpenTab.isOn,
      isScrolled: (main?.scrollTop ?? 0) > 0,
      isOnFirstPage: isSectionRoot(page.route.id),
    });
    if (tap === "firstPage") {
      return;
    }
    event.preventDefault();
    if (tap === "scrollToTop") {
      main?.scrollTo({
        top: 0,
        behavior: animations.moves("navigation") ? "smooth" : "auto",
      });
    }
  }
  const storage = setStorageCheck(new StorageCheck(commands, reportFailure));
  const updateCheck = updateCheckForApp();
  const needsAttention = setNeedsAttention(
    new NeedsAttention(
      {
        missingFolders: () => commands.missingLibraryFolders(),
        storageUse: () => storage.use,
      },
      reportFailure,
    ),
  );
  const folderFinder = noticingFolderFinder(notices, () =>
    needsAttention.gather(),
  );
  let isShowingShortcuts = $state(false);

  function goBack(): void {
    shownBackLink(document)?.click();
  }
  const keyboardOnlyShortcuts = $derived<readonly Shortcut[]>(
    isPointer(data.appInfo.platform)
      ? [
          {
            key: "?",
            run: () => {
              isShowingShortcuts = true;
            },
          },
          usesCommandKey(data.appInfo.platform)
            ? { key: "[", command: data.appInfo.platform, run: goBack }
            : { key: "ArrowLeft", alt: true, run: goBack },
          {
            key: ",",
            command: data.appInfo.platform,
            shift: false,
            run: () => {
              void goto(resolve("/(app)/settings"));
            },
          },
        ]
      : [],
  );

  const width = new WindowWidth();
  const isPaneCompact = new MediaQuery(
    paneFoldQuery(untrack(() => data.appInfo.platform)),
  );
  const isTabBarCollapsed = $derived(
    page.route.id === SEARCH_ROUTE_ID &&
      phoneOf(data.appInfo.platform, width.current) === "ios",
  );
  const isTabBarAfterPage = $derived(
    isPhone(data.appInfo.platform, width.current),
  );
  let wasTabBarAfterPage = untrack(() => isTabBarAfterPage);

  $effect.pre(() => {
    if (isTabBarAfterPage === wasTabBarAfterPage) {
      return;
    }
    wasTabBarAfterPage = isTabBarAfterPage;
    const href = focusedTabHref();
    if (href !== undefined) {
      void tick().then(() => {
        focusTab(href);
      });
    }
  });
  const isSearchViewOpen = $derived(
    page.route.id === SEARCH_ROUTE_ID &&
      phoneOf(data.appInfo.platform, width.current) === "android",
  );
  const wordingContext = $derived({
    usesStandIns: screenshotMode.isOn,
    device: deviceWordOf(data.appInfo.platform, width.current),
  });

  function fix(problem: Problem): void {
    void fixProblem(problem, folderFinder).then(() => needsAttention.gather());
  }

  async function showHomeArrival(arrival: HomeArrival): Promise<void> {
    const folders = new LibraryFolders(
      commands.libraryFolders,
      commands.removeLibraryFolder,
      commands.libraryFolderBookCount,
    );
    await folders.load();
    const notice = homeArrivalNotice(
      arrival,
      folders.list,
      data.appInfo.platform,
    );
    if (notice !== undefined) {
      notices.show(notice);
    }
  }

  function checkForUpdatesIfDue(): void {
    if (offersUpdateCheck(data.appInfo)) {
      void updateCheck.checkIfDue();
    }
  }

  function checkForUpdatesOnReturn(): void {
    if (document.visibilityState === "visible") {
      checkForUpdatesIfDue();
    }
  }

  onMount(() => {
    preloadCode(READER_ROUTE_ID).catch(reportFailure);
    const arrival = takeHomeArrival(data.homeArrival);
    if (arrival !== null) {
      void showHomeArrival(arrival);
    }
    void storage.check();
    void needsAttention.gather();
    checkForUpdatesIfDue();
    if (offersUpdateCheck(data.appInfo)) {
      void updateNoticesForApp().keepWords(noticeWords());
    }
    return listenForLibraryChanges(() => {
      void needsAttention.gather();
    }, reportFailure);
  });
</script>

<svelte:document onvisibilitychange={checkForUpdatesOnReturn} />

<svelte:window
  {@attach shortcut({
    key: "k",
    command: data.appInfo.platform,
    shift: false,
    inTextFields: true,
    run: () => {
      quickOpen.open();
    },
  })}
  {@attach shortcut(...keyboardOnlyShortcuts)}
  {@attach shortcut({
    key: PANE_SHORTCUT.letter.toLowerCase(),
    command: data.appInfo.platform,
    shift: PANE_SHORTCUT.shift,
    inTextFields: true,
    run: () => {
      if (
        isPaneToggledBy(data.appInfo.platform, {
          isCompact: isPaneCompact.current,
        })
      ) {
        sidebar.toggle();
      }
    },
  })}
/>

{#snippet attention({ isFolded }: { isFolded: boolean })}
  <NeedsAttentionSidebarItem
    problems={needsAttention.problems}
    context={wordingContext}
    {isFolded}
    onFix={fix}
  />
{/snippet}

{#snippet navigation()}
  {#if page.route.id !== EDIT_DETAILS_ROUTE}
    {#key language.resolved}
      {#if hasTopTabBar(data.appInfo.platform, width.current)}
        {#if showsTopTabBar(page.route.id)}
          <TopTabBar current={sectionOf(page.url.pathname)} />
        {/if}
      {:else}
        {#if !isSearchViewOpen}
          <AppNavigation
            current={sectionOf(page.url.pathname)}
            isCollapsed={isTabBarCollapsed}
            onOpenTabTap={androidPhone.isOn ? tapOpenSection : undefined}
            historyMoves={backGoesUp}
            attention={isPointer(data.appInfo.platform) &&
            needsAttention.problems.length > 0
              ? attention
              : undefined}
          />
        {/if}
      {/if}
    {/key}
  {/if}
{/snippet}

<div
  class="flex flex-col-reverse overflow-x-clip block-dvh medium:flex-row desktop-shell:flex-row windows:desktop-shell:bg-shell-ground"
>
  {#if !isTabBarAfterPage}
    {@render navigation()}
  {/if}
  <SwipeableMain
    isIos={data.appInfo.platform === "ios"}
    isAndroid={data.appInfo.platform === "android"}
    isFullScreen={page.route.id === EDIT_DETAILS_ROUTE}
  >
    {#key language.resolved}
      {@render children()}
    {/key}
  </SwipeableMain>
  {#if isTabBarAfterPage}
    {@render navigation()}
  {/if}
  <div
    class="relative z-notice order-1 desktop-shell:max-medium:fixed desktop-shell:max-medium:inset-x-none desktop-shell:max-medium:inset-be-none"
  >
    {#key language.resolved}
      <Toasts
        {notices}
        platform={data.appInfo.platform}
        theme={theme.resolved}
      />
    {/key}
  </div>
</div>
{#key language.resolved}
  <NeedsAttentionSheet
    attention={needsAttention}
    context={wordingContext}
    onFix={fix}
  />
{/key}
<FindFolderSheet finder={folderFinder} platform={data.appInfo.platform} />
<ScreenshotModeNotice platform={data.appInfo.platform} />
<LowSpaceNotice {storage} device={wordingContext.device} />
<AppKeyboardShortcuts
  isOpen={isShowingShortcuts}
  platform={data.appInfo.platform}
  onClose={() => {
    isShowingShortcuts = false;
  }}
/>
{#key language.resolved}
  <QuickOpen
    platform={data.appInfo.platform}
    {quickOpen}
    usesStandIns={screenshotMode.isOn}
    finder={folderFinder}
    missingFolders={needsAttention.problems.flatMap((problem) =>
      problem.kind === "missingFolder" ? [problem.missing] : [],
    )}
  />
{/key}
