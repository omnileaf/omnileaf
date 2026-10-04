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

  import type { LayoutProps } from "./$types";

  import "../app.css";

  let { children, data }: LayoutProps = $props();

  const themeSetting = setThemeSetting(themeSettingForDocument());

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

<svelte:head>
  <title>{m.app_name()}</title>
</svelte:head>

<div class="flex flex-col-reverse block-dvh medium:flex-row">
  <AppNavigation current={sectionOf(page.url.pathname)} />
  <main
    class="order-2 flex flex-1 flex-col overflow-y-auto px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance"
  >
    {@render children()}
  </main>
  <div class="relative z-notice order-1">
    <NoticeHost notices={data.notices} platform={data.appInfo.platform} />
  </div>
</div>
