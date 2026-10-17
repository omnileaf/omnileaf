<script lang="ts">
  import { onMount } from "svelte";

  import { page } from "$app/state";

  import { LinkOpening } from "#lib/about/link-opening.svelte.ts";
  import { systemBarsTheme } from "#lib/appearance/theme.ts";
  import {
    setThemeSetting,
    themeSettingForDocument,
  } from "#lib/appearance/theme.svelte.ts";
  import {
    crashReportSettingForDocument,
    setCrashReportSetting,
  } from "#lib/crash-report/choice.svelte.ts";
  import {
    CrashReporting,
    setCrashReporting,
  } from "#lib/crash-report/crash-reporting.svelte.ts";
  import CrashReportPrompt from "#lib/crash-report/CrashReportPrompt.svelte";
  import { appInterfaceErrors } from "#lib/crash-report/interface-error-relay.ts";
  import type { PromptLook } from "#lib/crash-report/look.ts";
  import IconActionsSync from "#lib/icon-actions/IconActionsSync.svelte";
  import { commands } from "#lib/ipc/bindings.ts";
  import { rescanEveryFolder } from "#lib/library/rescan-folder.ts";
  import {
    languageSettingForDocument,
    setLanguageSetting,
  } from "#lib/language/language.svelte.ts";
  import { Notices, setNotices } from "#lib/notices/notices.ts";
  import {
    setUndoSetting,
    undoSettingForDocument,
  } from "#lib/notices/undo-setting.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone, isPointer } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    BookPresence,
    setBookPresence,
  } from "#lib/reader/book-presence.svelte.ts";
  import LibraryProblemScreen from "#lib/problems/LibraryProblemScreen.svelte";
  import {
    screenshotModeForDocument,
    setScreenshotMode,
  } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import {
    scheduledRescansSettingForDocument,
    setScheduledRescansSetting,
  } from "#lib/scheduled-rescans/scheduled-rescans.svelte.ts";
  import {
    setSwipeActionsSetting,
    swipeActionsSettingForDocument,
  } from "#lib/series/swipe-actions.svelte.ts";
  import {
    setSkipUpNextSetting,
    skipUpNextSettingForDocument,
  } from "#lib/up-next/skip-up-next.svelte.ts";
  import {
    setSmartFeatures,
    smartFeaturesForDocument,
  } from "#lib/reader/smart-features.svelte.ts";
  import {
    opensOnSettingForDocument,
    setOpensOnSetting,
  } from "#lib/general/opens-on.svelte.ts";
  import {
    setTimeFormatSetting,
    timeFormatSettingForDocument,
  } from "#lib/general/time-format.svelte.ts";
  import {
    ANIMATIONS_PREFERENCE_KEY,
    animationsSettingForDocument,
    setAnimationsSetting,
  } from "#lib/appearance/animations.svelte.ts";
  import ScreenshotModeAnnouncement from "#lib/screenshot-mode/ScreenshotModeAnnouncement.svelte";
  import {
    screenshotModeShortcutForDocument,
    setScreenshotModeShortcut,
  } from "#lib/screenshot-mode/shortcut-setting.svelte.ts";
  import { shortcut } from "#lib/shortcut.ts";
  import TrayMenuSync from "#lib/tray/TrayMenuSync.svelte";

  import type { LayoutProps } from "./$types";

  import "../app.css";

  const APP_ROUTES = "/(app)";

  let { data, children }: LayoutProps = $props();

  const themeSetting = setThemeSetting(themeSettingForDocument());
  const language = setLanguageSetting(languageSettingForDocument());
  const screenshotMode = setScreenshotMode(screenshotModeForDocument());
  const screenshotModeShortcut = setScreenshotModeShortcut(
    screenshotModeShortcutForDocument(),
  );
  const crashReportSetting = setCrashReportSetting(
    crashReportSettingForDocument(),
  );
  const crashReporting = setCrashReporting(
    new CrashReporting(commands, crashReportSetting),
  );
  const scheduledRescans = setScheduledRescansSetting(
    scheduledRescansSettingForDocument(),
  );
  setSkipUpNextSetting(skipUpNextSettingForDocument());
  setSmartFeatures(smartFeaturesForDocument());
  setOpensOnSetting(opensOnSettingForDocument());
  setTimeFormatSetting(timeFormatSettingForDocument());
  const animations = setAnimationsSetting(animationsSettingForDocument());
  setSwipeActionsSetting(swipeActionsSettingForDocument());
  const undo = setUndoSetting(undoSettingForDocument());
  setNotices(new Notices(() => undo.rules));
  const bookPresence = setBookPresence(new BookPresence());

  function settleScreenshotMode(): void {
    screenshotMode.settle();
  }

  const rescansOnReturn = $derived(
    !isPointer(data.appInfo.platform) && data.libraryProblem === null,
  );

  let isRescanningOnReturn = false;

  async function rescanOnReturn(): Promise<void> {
    if (isRescanningOnReturn) {
      return;
    }
    isRescanningOnReturn = true;
    try {
      await rescanEveryFolder();
    } finally {
      isRescanningOnReturn = false;
    }
  }

  function followVisibility(): void {
    settleScreenshotMode();
    if (rescansOnReturn && document.visibilityState === "visible") {
      void rescanOnReturn();
    }
  }

  $effect(() => {
    void commands.matchSystemBars(
      systemBarsTheme(themeSetting.resolved, bookPresence.isOpen),
      themeSetting.preference,
    );
  });

  $effect(() => {
    void commands.setAppLanguage(language.resolved);
  });

  $effect(() => {
    const root = document.documentElement;
    if (animations.stillGroups === "") {
      delete root.dataset.still;
    } else {
      root.dataset.still = animations.stillGroups;
    }
  });

  $effect(() => {
    if (data.libraryProblem === null) {
      void commands.setScheduledRescans(
        scheduledRescans.isOnFor(data.appInfo.platform),
      );
    }
  });

  const opening = new LinkOpening(commands.openProjectLink);

  const width = new WindowWidth();
  const promptLook: PromptLook = $derived(
    isPhone(data.appInfo.platform, width.current) ? "phone" : "dialog",
  );

  onMount(() => {
    void crashReporting.offerSaved();
    if (data.libraryProblem === null) {
      void rescanEveryFolder();
    }
    return appInterfaceErrors.deliverTo((error) => {
      void crashReporting.offerInterfaceError(error);
    });
  });
</script>

<svelte:window
  {@attach shortcut(
    screenshotModeShortcut.shortcut(data.appInfo.platform, () => {
      screenshotMode.toggle();
    }),
  )}
  onfocus={settleScreenshotMode}
  onpageshow={settleScreenshotMode}
  onstorage={(event: StorageEvent) => {
    if (event.key === ANIMATIONS_PREFERENCE_KEY) {
      animations.reread();
    }
  }}
/>
<svelte:document onvisibilitychange={followVisibility} />

<svelte:head>
  {#key language.resolved}
    <title>{m.app_name()}</title>
  {/key}
</svelte:head>

{#if data.libraryProblem === null}
  {@render children()}
{:else}
  <LibraryProblemScreen problem={data.libraryProblem} {opening} />
{/if}
{#key language.resolved}
  <ScreenshotModeAnnouncement
    announcesTurningOn={page.route.id?.startsWith(APP_ROUTES) !== true}
  />
  {#if data.libraryProblem === null && isPointer(data.appInfo.platform)}
    <TrayMenuSync />
  {/if}
  {#if data.libraryProblem === null && !data.isFirstLaunch && !isPointer(data.appInfo.platform)}
    <IconActionsSync />
  {/if}
{/key}
<CrashReportPrompt reporting={crashReporting} look={promptLook} />
