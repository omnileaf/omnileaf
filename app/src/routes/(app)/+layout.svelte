<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { getLanguageSetting } from "#lib/language/language.svelte.ts";
  import AppNavigation from "#lib/navigation/AppNavigation.svelte";
  import { makeBackGoUp, setBackGoesUp } from "#lib/navigation/back-goes-up.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import { sectionOf } from "#lib/navigation/sections.ts";
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
      <NoticeHost {notices} platform={data.appInfo.platform} />
    {/key}
  </div>
</div>
