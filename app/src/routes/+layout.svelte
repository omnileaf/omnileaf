<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import {
    setThemeSetting,
    themeSettingForDocument,
  } from "$lib/appearance/theme.svelte";
  import {
    crashReportSettingForDocument,
    setCrashReportSetting,
  } from "$lib/crash-report/choice.svelte";
  import { CrashReporting } from "$lib/crash-report/crash-reporting.svelte";
  import CrashReportPrompt from "$lib/crash-report/CrashReportPrompt.svelte";
  import { listenForInterfaceErrors } from "$lib/crash-report/interface-errors";
  import { commands } from "$lib/ipc/bindings";
  import AppNavigation from "$lib/navigation/AppNavigation.svelte";
  import { sectionOf } from "$lib/navigation/sections";
  import { WindowWidth } from "$lib/page/breakpoints";
  import { isPhone } from "$lib/page/platform";
  import { m } from "$lib/paraglide/messages.js";

  import "../app.css";

  import type { LayoutData } from "./$types";

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  setThemeSetting(themeSettingForDocument());
  const crashReportSetting = crashReportSettingForDocument();
  setCrashReportSetting(crashReportSetting);
  const crashReporting = new CrashReporting(commands, crashReportSetting);

  const width = new WindowWidth();
  const onPhone = $derived(isPhone(data.appInfo.platform, width.current));

  onMount(() => {
    void crashReporting.offerSaved();
    return listenForInterfaceErrors(window, (error) => {
      void crashReporting.offerInterfaceError(error);
    });
  });

  let main: HTMLElement | undefined = $state();

  afterNavigate(({ type }) => {
    if (type !== "enter") {
      main?.querySelector<HTMLHeadingElement>("h1")?.focus();
    }
  });
</script>

<svelte:head>
  <title>{m.app_name()}</title>
</svelte:head>

<div class="flex flex-col-reverse block-dvh medium:flex-row">
  <AppNavigation current={sectionOf(page.url.pathname)} />
  <main
    bind:this={main}
    class="flex flex-1 flex-col overflow-y-auto px-gutter py-xl pe-page-end pbs-page-top max-medium:ps-page-start medium:pbe-page-bottom ios:max-medium:pbe-floating-clearance"
  >
    {@render children()}
  </main>
</div>
<CrashReportPrompt reporting={crashReporting} {onPhone} />
