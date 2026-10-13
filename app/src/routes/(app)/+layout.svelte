<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import AppNavigation from "#lib/navigation/AppNavigation.svelte";
  import { makeBackGoUp, setBackGoesUp } from "#lib/navigation/back-goes-up.ts";
  import { focusArrival } from "#lib/navigation/page-heading.ts";
  import { sectionOf } from "#lib/navigation/sections.ts";
  import SwipeableMain from "#lib/navigation/SwipeableMain.svelte";
  import { getNotices } from "#lib/notices/notices.ts";
  import Toasts from "#lib/notices/Toasts.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import QuickOpen from "#lib/search/QuickOpen.svelte";
  import { isQuickOpenShortcut } from "#lib/search/quick-open-shortcut.ts";
  import { QuickOpenState } from "#lib/search/quick-open-state.svelte.ts";

  import type { LayoutProps } from "./$types";

  let { children, data }: LayoutProps = $props();

  const language = getLanguageSetting();
  const notices = getNotices();
  const theme = getThemeSetting();
  const screenshotMode = getScreenshotMode();
  const backGoesUp = setBackGoesUp(makeBackGoUp());
  const quickOpen = new QuickOpenState();

  function openQuickOpen(event: KeyboardEvent): void {
    if (isQuickOpenShortcut(event, data.appInfo.platform)) {
      event.preventDefault();
      quickOpen.open();
    }
  }

  afterNavigate(({ type }) => {
    const isProblem = page.error !== null;
    const isArrival = type !== "enter" && !backGoesUp.isPassingThrough;
    if (isArrival || isProblem) {
      focusArrival();
    }
  });
</script>

<svelte:window onkeydown={openQuickOpen} />

<div class="flex flex-col-reverse overflow-x-clip block-dvh medium:flex-row">
  {#key language.resolved}
    <AppNavigation current={sectionOf(page.url.pathname)} />
  {/key}
  <SwipeableMain isIos={data.appInfo.platform === "ios"}>
    {#key language.resolved}
      {@render children()}
    {/key}
  </SwipeableMain>
  <div
    class="relative z-notice order-1 ios:max-medium:fixed ios:max-medium:inset-x-none ios:max-medium:inset-be-toast-lift"
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
  <QuickOpen
    platform={data.appInfo.platform}
    {quickOpen}
    usesStandIns={screenshotMode.isOn}
  />
{/key}
