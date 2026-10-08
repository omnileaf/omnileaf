<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import type { AppInfo } from "#lib/ipc/bindings.ts";

  import {
    type SectionSummary,
    type SettingsRoute,
    type SettingsSection,
    settingsGroups,
  } from "./sections";

  let {
    app,
    summaries,
  }: {
    app: Pick<AppInfo, "isDevelopmentBuild">;
    summaries: Partial<Record<SettingsRoute, SectionSummary>>;
  } = $props();

  const groups = $derived(settingsGroups(app));

  const ICON_SIZE = 20;
  const CHEVRON_SIZE = 18;
  const TILE_BACKGROUNDS = {
    accent: "bg-accent-soft",
    neutral: "bg-chip",
  } satisfies Record<SettingsSection["tone"], string>;
</script>

<div class="flex flex-col gap-xl desktop:gap-lg">
  {#each groups as group, index (index)}
    <ul
      class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card"
    >
      {#each group as section (section.route)}
        {@const summary = summaries[section.route]}
        <li>
          <a
            href={resolve(section.route)}
            class="flex items-center gap-list-row py-sm ps-list-row pe-md transition-control min-block-4xl hover:bg-hover active:bg-pressed desktop:gap-md desktop:py-none desktop:min-block-settings-row"
          >
            <span
              class={[
                "flex shrink-0 items-center justify-center rounded-tile block-tile inline-tile desktop:bg-transparent desktop:block-auto desktop:inline-auto",
                TILE_BACKGROUNDS[section.tone],
              ]}
            >
              <section.icon
                size={ICON_SIZE}
                class="desktop:block-settings-icon desktop:inline-settings-icon"
              />
            </span>
            <span
              class="flex flex-1 flex-col desktop:flex-row desktop:items-center desktop:gap-md"
            >
              <span class="font-semibold desktop:flex-1 desktop:text-callout">
                {section.label()}
              </span>
              {#if summary !== undefined}
                <span lang={summary.lang} class="text-footnote text-muted"
                  >{summary.text}</span
                >
              {/if}
            </span>
            <ChevronRight
              size={CHEVRON_SIZE}
              class="shrink-0 text-muted rtl:-scale-x-100"
            />
          </a>
        </li>
      {/each}
    </ul>
  {/each}
</div>
