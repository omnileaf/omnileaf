<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import AppNavigation from "#lib/navigation/AppNavigation.svelte";
  import { makeBackGoUp, setBackGoesUp } from "#lib/navigation/back-goes-up.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import { sectionOf } from "#lib/navigation/sections.ts";
  import SwipeableMain from "#lib/navigation/SwipeableMain.svelte";
  import NoticeHost from "#lib/notices/NoticeHost.svelte";
  import { getNotices } from "#lib/notices/notices.svelte.ts";

  import type { LayoutProps } from "./$types";

  let { children, data }: LayoutProps = $props();

  const language = getLanguageSetting();
  const notices = getNotices();
  const backGoesUp = setBackGoesUp(makeBackGoUp());

  afterNavigate(({ type }) => {
    const isProblem = page.error !== null;
    const isArrival = type !== "enter" && !backGoesUp.isPassingThrough;
    if (isArrival || isProblem) {
      focusPageHeading();
    }
  });
</script>

<div class="flex flex-col-reverse overflow-x-clip block-dvh medium:flex-row">
  {#key language.resolved}
    <AppNavigation current={sectionOf(page.url.pathname)} />
  {/key}
  <SwipeableMain isIos={data.appInfo.platform === "ios"}>
    {#key language.resolved}
      {@render children()}
    {/key}
  </SwipeableMain>
  <div class="relative z-notice order-1">
    {#key language.resolved}
      <NoticeHost {notices} platform={data.appInfo.platform} />
    {/key}
  </div>
</div>
