<script lang="ts">
  import type { Snippet } from "svelte";

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
  import { sectionOf } from "$lib/navigation/sections";
  import { m } from "$lib/paraglide/messages.js";

  import "../app.css";

  let { children }: { children: Snippet } = $props();

  const themeSetting = setThemeSetting(themeSettingForDocument());
  const language = setLanguageSetting(languageSettingForDocument());

  $effect(() => {
    void commands.matchSystemBars(
      themeSetting.resolved,
      themeSetting.preference,
    );
  });

  let main: HTMLElement | undefined = $state();

  afterNavigate(({ type }) => {
    if (type !== "enter") {
      main?.querySelector<HTMLHeadingElement>("h1")?.focus();
    }
  });
</script>

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
    bind:this={main}
    class="flex flex-1 flex-col overflow-y-auto px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance"
  >
    {#key language.resolved}
      {@render children()}
    {/key}
  </main>
</div>
