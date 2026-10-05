<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import {
    setThemeSetting,
    themeSettingForDocument,
  } from "$lib/appearance/theme.svelte";
  import { commands } from "$lib/ipc/bindings";
  import {
    languageSettingForDocument,
    setLanguageSetting,
  } from "$lib/language/language.svelte";
  import AppNavigation from "$lib/navigation/AppNavigation.svelte";
  import { makeBackGoUp, setBackGoesUp } from "$lib/navigation/back-goes-up";
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
  const language = setLanguageSetting(languageSettingForDocument());
  const screenshotMode = setScreenshotMode(screenshotModeForDocument());
  const backGoesUp = setBackGoesUp(makeBackGoUp());

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

  afterNavigate(({ type }) => {
    const isProblem = page.error !== null;
    const isArrival = type !== "enter" && !backGoesUp.isPassingThrough;
    if (isArrival || isProblem) {
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
  {#key language.resolved}
    <title>{m.app_name()}</title>
  {/key}
</svelte:head>

<div class="flex flex-col-reverse block-dvh medium:flex-row">
  {#key language.resolved}
    <AppNavigation current={sectionOf(page.url.pathname)} />
  {/key}
  <main
    class="order-2 flex flex-1 flex-col overflow-y-auto px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance"
  >
    {#key language.resolved}
      {@render children()}
    {/key}
  </main>
  <div class="relative z-notice order-1">
    {#key language.resolved}
      <NoticeHost notices={data.notices} platform={data.appInfo.platform} />
    {/key}
  </div>
</div>
{#key language.resolved}
  <ScreenshotModeAnnouncement />
{/key}
