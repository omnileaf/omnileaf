<script lang="ts">
  import { onMount } from "svelte";

  import { LinkOpening } from "#lib/about/link-opening.svelte.ts";
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
  import { commands } from "#lib/ipc/bindings.ts";
  import { rescanEveryFolder } from "#lib/library/rescan-folder.ts";
  import {
    languageSettingForDocument,
    setLanguageSetting,
  } from "#lib/language/language.svelte.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import LibraryProblemScreen from "#lib/problems/LibraryProblemScreen.svelte";
  import {
    screenshotModeForDocument,
    setScreenshotMode,
  } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import ScreenshotModeAnnouncement from "#lib/screenshot-mode/ScreenshotModeAnnouncement.svelte";
  import {
    isScreenshotModeShortcut,
    screenshotModeShortcutOn,
  } from "#lib/screenshot-mode/shortcut.ts";

  import type { LayoutProps } from "./$types";

  import "../app.css";

  let { data, children }: LayoutProps = $props();

  const themeSetting = setThemeSetting(themeSettingForDocument());
  const language = setLanguageSetting(languageSettingForDocument());
  const screenshotMode = setScreenshotMode(screenshotModeForDocument());
  const crashReportSetting = setCrashReportSetting(
    crashReportSettingForDocument(),
  );
  const crashReporting = setCrashReporting(
    new CrashReporting(commands, crashReportSetting),
  );
  const screenshotModeShortcut = $derived(
    screenshotModeShortcutOn(data.appInfo.platform),
  );

  function toggleScreenshotModeOnShortcut(event: KeyboardEvent): void {
    if (!isScreenshotModeShortcut(screenshotModeShortcut, event)) {
      return;
    }
    event.preventDefault();
    screenshotMode.toggle();
  }

  function settleScreenshotMode(): void {
    screenshotMode.settle();
  }

  $effect(() => {
    void commands.matchSystemBars(
      themeSetting.resolved,
      themeSetting.preference,
    );
  });

  $effect(() => {
    void commands.setAppLanguage(language.resolved);
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
  onkeydown={toggleScreenshotModeOnShortcut}
  onfocus={settleScreenshotMode}
  onpageshow={settleScreenshotMode}
/>
<svelte:document onvisibilitychange={settleScreenshotMode} />

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
  <ScreenshotModeAnnouncement />
{/key}
<CrashReportPrompt reporting={crashReporting} look={promptLook} />
