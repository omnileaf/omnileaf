<script lang="ts">
  import { resolve } from "$app/paths";
  import type { ThemePreference } from "#lib/appearance/theme.ts";
  import { getThemeSetting } from "#lib/appearance/theme.svelte.ts";
  import { onMount } from "svelte";

  import { getOpensOnSetting } from "#lib/general/opens-on.svelte.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { NEW_LIBRARY_LISTING } from "#lib/library/library-listing.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
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

  const OPENING_SECTION: SettingsRoute = "/(app)/settings/general";
  const THEME_SUMMARIES = {
    system: m.theme_follows_system,
    light: m.theme_light,
    dark: m.theme_dark,
  } satisfies Record<ThemePreference, () => string>;
  const PLACE_NAMES = {
    library: m.general_opens_library,
    history: m.general_opens_history,
    lastBook: m.general_opens_last_book,
  } as const;

  let { data }: PageProps = $props();

  const backGoesUp = getBackGoesUp();
  const theme = getThemeSetting();
  const opensOn = getOpensOnSetting();
  const screenshotMode = getScreenshotMode();
  let librarySummary = $state<string | undefined>();

  onMount(() => {
    void Promise.all([
      commands.libraryFolders(null),
      commands.librarySeriesCount(NEW_LIBRARY_LISTING.filter),
    ]).then(([folders, series]) => {
      if (
        folders.status !== "ok" ||
        series.status !== "ok" ||
        folders.data.folders.length === 0
      ) {
        return;
      }
      librarySummary = m.settings_summary_pair({
        first: m.settings_folder_count({ count: folders.data.folders.length }),
        second: m.library_series_count({ count: series.data }),
      });
    });
  });
  const width = new WindowWidth();

  $effect(() => {
    if (showsSectionsBeside(width.current)) {
      void backGoesUp.replaceWith(resolve(OPENING_SECTION));
    }
  });

  const summaries: Partial<Record<SettingsRoute, SectionSummary>> = $derived({
    "/(app)/settings/appearance": { text: THEME_SUMMARIES[theme.preference]() },
    "/(app)/settings/privacy": {
      text: screenshotMode.isOn
        ? m.settings_summary_screenshot_on()
        : m.settings_summary_screenshot_off(),
    },
    "/(app)/settings/general": {
      text: m.settings_summary_pair({
        first: languageName(getLocale()),
        second: m.settings_summary_opens_on({
          place: PLACE_NAMES[opensOn.choice](),
        }),
      }),
    },
    ...(librarySummary !== undefined && {
      "/(app)/settings/library": { text: librarySummary },
    }),
    "/(app)/settings/advanced": { text: m.settings_summary_advanced() },
    "/(app)/settings/about": {
      text: m.app_version({ version: data.appInfo.version }),
    },
  });
</script>

<div class="two-pane:hidden">
  <div
    aria-hidden="true"
    class="hidden items-center border-be border-border text-small desktop:-mx-gutter desktop:-mbs-page-top desktop:mbe-xl desktop:flex desktop:px-gutter desktop:min-block-toolbar"
  >
    {m.settings_title()}
  </div>
  <PageHeading title={m.settings_title()} />
  <div class="mbs-lg">
    <SettingsIndex {summaries} />
  </div>
</div>
