<script lang="ts">
  import {
    ChevronRight,
    Info,
    Library,
    type LucideIcon,
    Palette,
    Settings,
  } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  type Route =
    | "/settings/library"
    | "/settings/appearance"
    | "/settings/general"
    | "/settings/about";

  interface SettingsPage {
    readonly route: Route;
    readonly label: () => string;
    readonly icon: LucideIcon;
    readonly tile: "bg-accent-soft" | "bg-chip";
  }

  const ICON_SIZE = 20;
  const CHEVRON_SIZE = 18;

  const SETTINGS_GROUPS: readonly (readonly SettingsPage[])[] = [
    [
      {
        route: "/settings/library",
        label: m.library_title,
        icon: Library,
        tile: "bg-accent-soft",
      },
      {
        route: "/settings/appearance",
        label: m.appearance_title,
        icon: Palette,
        tile: "bg-accent-soft",
      },
    ],
    [
      {
        route: "/settings/general",
        label: m.general_title,
        icon: Settings,
        tile: "bg-accent-soft",
      },
    ],
    [
      {
        route: "/settings/about",
        label: m.about_title,
        icon: Info,
        tile: "bg-chip",
      },
    ],
  ];

  let { data }: PageProps = $props();

  const summaries: Partial<Record<Route, string>> = $derived({
    "/settings/about": m.app_version({ version: data.appInfo.version }),
  });
</script>

<PageHeading title={m.settings_title()} />
<div class="mbs-lg flex flex-col gap-xl">
  {#each SETTINGS_GROUPS as group, index (index)}
    <ul
      class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card"
    >
      {#each group as settingsPage (settingsPage.route)}
        {@const summary = summaries[settingsPage.route]}
        <li>
          <a
            href={resolve(settingsPage.route)}
            class="flex items-center gap-list-row py-sm ps-list-row pe-md min-block-4xl"
          >
            <span
              class={[
                "flex shrink-0 items-center justify-center rounded-tile block-tile inline-tile",
                settingsPage.tile,
              ]}
            >
              <settingsPage.icon size={ICON_SIZE} aria-hidden="true" />
            </span>
            <span class="flex flex-1 flex-col">
              <span class="font-semibold">{settingsPage.label()}</span>
              {#if summary !== undefined}
                <span class="text-footnote text-muted">{summary}</span>
              {/if}
            </span>
            <ChevronRight
              size={CHEVRON_SIZE}
              aria-hidden="true"
              class="shrink-0 text-muted"
            />
          </a>
        </li>
      {/each}
    </ul>
  {/each}
</div>
