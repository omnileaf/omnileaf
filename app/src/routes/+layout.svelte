<script lang="ts">
  import {
    setThemeSetting,
    themeSettingForDocument,
  } from "$lib/appearance/theme.svelte";
  import { commands } from "$lib/ipc/bindings";
  import {
    languageSettingForDocument,
    setLanguageSetting,
  } from "$lib/language/language.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import {
    screenshotModeForDocument,
    setScreenshotMode,
  } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import ScreenshotModeAnnouncement from "$lib/screenshot-mode/ScreenshotModeAnnouncement.svelte";
  import { isScreenshotModeShortcut } from "$lib/screenshot-mode/shortcut";

  import type { LayoutProps } from "./$types";

  import "../app.css";

  let { children }: LayoutProps = $props();

  const themeSetting = setThemeSetting(themeSettingForDocument());
  const language = setLanguageSetting(languageSettingForDocument());
  const screenshotMode = setScreenshotMode(screenshotModeForDocument());

  function toggleScreenshotModeOnShortcut(event: KeyboardEvent): void {
    if (!isScreenshotModeShortcut(event)) {
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

{@render children()}
{#key language.resolved}
  <ScreenshotModeAnnouncement />
{/key}
