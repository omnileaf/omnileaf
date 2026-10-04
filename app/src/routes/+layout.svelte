<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import {
    setThemeSetting,
    themeSettingForDocument,
  } from "$lib/appearance/theme.svelte";
  import { commands } from "$lib/ipc/bindings";
  import AppNavigation from "$lib/navigation/AppNavigation.svelte";
  import { focusPageHeading } from "$lib/navigation/page-heading";
  import { sectionOf } from "$lib/navigation/sections";
  import NoticeHost from "$lib/notices/NoticeHost.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import {
    screenshotModeForDocument,
    setScreenshotMode,
  } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import ScreenshotModeAnnouncement from "$lib/screenshot-mode/ScreenshotModeAnnouncement.svelte";
  import { isScreenshotModeShortcut } from "$lib/screenshot-mode/shortcut";

  import type { LayoutProps } from "./$types";

  import "../app.css";

  let { children, data }: LayoutProps = $props();

  const themeSetting = setThemeSetting(themeSettingForDocument());
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
    void commands.matchSystemBars(themeSetting.resolved);
  });

  afterNavigate(({ type }) => {
    const isProblem = page.error !== null;
    if (type !== "enter" || isProblem) {
      focusPageHeading();
    }
  });
</script>

<svelte:window
  onkeydown={toggleScreenshotModeOnShortcut}
  onfocus={settleScreenshotMode}
  onpageshow={settleScreenshotMode}
/>
<svelte:document onvisibilitychange={settleScreenshotMode} />

<svelte:head>
  <title>{m.app_name()}</title>
</svelte:head>

<div class="flex flex-col-reverse block-dvh medium:flex-row">
  <AppNavigation current={sectionOf(page.url.pathname)} />
  <main
    class="order-2 flex-1 overflow-y-auto p-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance"
  >
    {@render children()}
  </main>
  <div class="relative z-notice order-1">
    <NoticeHost notices={data.notices} platform={data.appInfo.platform} />
  </div>
</div>
<ScreenshotModeAnnouncement />
