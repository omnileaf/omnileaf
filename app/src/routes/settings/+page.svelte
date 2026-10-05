<script lang="ts">
  import { resolve } from "$app/paths";
  import type { ThemePreference } from "$lib/appearance/theme";
  import { getThemeSetting } from "$lib/appearance/theme.svelte";
  import { languageName } from "$lib/language/language";
  import { getBackGoesUp } from "$lib/navigation/back-goes-up";
  import { WindowWidth } from "$lib/page/breakpoints";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";
  import type { SectionSummary, SettingsRoute } from "$lib/settings/sections";
  import SettingsIndex from "$lib/settings/SettingsIndex.svelte";
  import { showsSectionsBeside } from "$lib/settings/panes";

  import type { PageProps } from "./$types";

  const OPENING_SECTION: SettingsRoute = "/settings/library";
  const THEME_SUMMARIES = {
    system: m.theme_follows_system,
    light: m.theme_light,
    dark: m.theme_dark,
  } satisfies Record<ThemePreference, () => string>;

  let { data }: PageProps = $props();

  const backGoesUp = getBackGoesUp();
  const theme = getThemeSetting();
  const width = new WindowWidth();

  $effect(() => {
    if (showsSectionsBeside(data.appInfo.platform, width.current)) {
      void backGoesUp.replaceWith(resolve(OPENING_SECTION));
    }
  });

  const summaries: Partial<Record<SettingsRoute, SectionSummary>> = $derived({
    "/settings/appearance": { text: THEME_SUMMARIES[theme.preference]() },
    "/settings/general": {
      text: languageName(getLocale()),
      lang: getLocale(),
    },
    "/settings/about": {
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
