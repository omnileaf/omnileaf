<script lang="ts">
  import { resolve } from "$app/paths";
  import type { ThemePreference } from "#lib/appearance/theme.ts";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import {
    type CrashReportChoice,
    getCrashReportSetting,
  } from "#lib/crash-report/choice.svelte.ts";
  import { languageName } from "#lib/language/language.ts";
  import { getBackGoesUp } from "#lib/navigation/back-goes-up.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import PageHeading from "#lib/page/PageHeading.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import type {
    SectionSummary,
    SettingsRoute,
  } from "#lib/settings/sections.ts";
  import SettingsIndex from "#lib/settings/SettingsIndex.svelte";
  import { showsSectionsBeside } from "#lib/settings/panes.ts";

  import type { PageProps } from "./$types";

  const OPENING_SECTION: SettingsRoute = "/(app)/settings/library";
  const THEME_SUMMARIES = {
    system: m.theme_follows_system,
    light: m.theme_light,
    dark: m.theme_dark,
  } satisfies Record<ThemePreference, () => string>;
  const PRIVACY_SUMMARIES = {
    ask: m.privacy_summary_ask,
    always: m.privacy_summary_always,
    never: m.privacy_summary_never,
  } satisfies Record<CrashReportChoice, () => string>;

  let { data }: PageProps = $props();

  const backGoesUp = getBackGoesUp();
  const theme = getThemeSetting();
  const crashReports = getCrashReportSetting();
  const width = new WindowWidth();

  $effect(() => {
    if (showsSectionsBeside(data.appInfo.platform, width.current)) {
      void backGoesUp.replaceWith(resolve(OPENING_SECTION));
    }
  });

  const summaries: Partial<Record<SettingsRoute, SectionSummary>> = $derived({
    "/(app)/settings/appearance": { text: THEME_SUMMARIES[theme.preference]() },
    "/(app)/settings/privacy": {
      text: PRIVACY_SUMMARIES[crashReports.choice](),
    },
    "/(app)/settings/general": {
      text: languageName(getLocale()),
      lang: getLocale(),
    },
    ...(data.appInfo.isDevelopmentBuild && {
      "/(app)/settings/advanced": { text: m.advanced_summary() },
    }),
    "/(app)/settings/about": {
      text: m.app_version({ version: data.appInfo.version }),
    },
  });
</script>

<div class="two-pane:hidden">
  <PageHeading title={m.settings_title()} />
  <div class="mbs-lg">
    <SettingsIndex {summaries} />
  </div>
</div>
