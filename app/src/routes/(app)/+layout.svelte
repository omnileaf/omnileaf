<script lang="ts">
  import { afterNavigate, goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import AppKeyboardShortcuts from "#lib/keyboard/AppKeyboardShortcuts.svelte";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import AppNavigation from "#lib/navigation/AppNavigation.svelte";
  import { makeBackGoUp, setBackGoesUp } from "#lib/navigation/back-goes-up.ts";
  import { focusArrival } from "#lib/navigation/page-heading.ts";
  import { sectionOf } from "#lib/navigation/sections.ts";
  import {
    setSidebarSetting,
    sidebarSettingForDocument,
  } from "#lib/navigation/sidebar.svelte.ts";
  import SwipeableMain from "#lib/navigation/SwipeableMain.svelte";
  import { getNotices } from "#lib/notices/notices.ts";
  import Toasts from "#lib/notices/Toasts.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import QuickOpen from "#lib/search/QuickOpen.svelte";
  import { QuickOpenState } from "#lib/search/quick-open-state.svelte.ts";
  import { shownBackLink } from "#lib/navigation/back-link.ts";
  import { isPointer, usesCommandKey } from "#lib/page/platform.ts";
  import { type Shortcut, shortcut } from "#lib/shortcut.ts";

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

  afterNavigate(({ type }) => {
    const isProblem = page.error !== null;
    const isArrival = type !== "enter" && !backGoesUp.isPassingThrough;
    if (isArrival || isProblem) {
      focusArrival();
    }
  });
</script>

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
    key: "b",
    command: data.appInfo.platform,
    shift: false,
    inTextFields: true,
    run: () => {
      sidebar.toggle();
    },
  })}
/>

<div
  class="flex flex-col-reverse overflow-x-clip block-dvh medium:flex-row desktop-shell:flex-row"
>
  {#if page.route.id !== EDIT_DETAILS_ROUTE}
    {#key language.resolved}
      <AppNavigation current={sectionOf(page.url.pathname)} />
    {/key}
  {/if}
  <SwipeableMain
    isIos={data.appInfo.platform === "ios"}
    isFullScreen={page.route.id === EDIT_DETAILS_ROUTE}
  >
    {#key language.resolved}
      {@render children()}
    {/key}
  </SwipeableMain>
  <div
    class="relative z-notice order-1 ios:max-medium:fixed ios:max-medium:inset-x-none ios:max-medium:inset-be-toast-lift desktop-shell:max-medium:fixed desktop-shell:max-medium:inset-x-none desktop-shell:max-medium:inset-be-none"
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
  />
{/key}
