<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";

  import {
    type SectionChip,
    type SectionSummary,
    type SettingsRoute,
    SETTINGS_GROUPS,
  } from "./sections";

  let {
    summaries,
  }: {
    summaries: Partial<Record<SettingsRoute, SectionSummary>>;
  } = $props();

  const ICON_SIZE = 18;
  const CHEVRON_SIZE = 18;
  const IOS_CHIPS = {
    grey: "ios:bg-ios-chip-grey",
    blue: "ios:bg-ios-chip-blue",
    green: "ios:bg-ios-chip-green",
    orange: "ios:bg-ios-chip-orange",
  } satisfies Record<SectionChip, string>;
  const headingId = $props.id();
</script>

<div class="flex flex-col gap-xl">
  {#each SETTINGS_GROUPS as group, index (index)}
    <section class="flex flex-col gap-sm">
      {#if group.heading !== undefined}
        <h2
          id="{headingId}-{index}"
          class="px-lg text-small font-semibold text-muted ios:text-detail ios:font-regular ios:tracking-heading-caps ios:uppercase android:font-medium android:text-accent"
        >
          {group.heading()}
        </h2>
      {/if}
      <ul
        aria-labelledby={group.heading === undefined
          ? undefined
          : `${headingId}-${String(index)}`}
        class="divide-y divide-border overflow-hidden rounded-list border border-border bg-card ios:divide-y-0 ios:border-transparent ios:bg-ios-cell android:rounded-android-md android:border-transparent android:bg-android-container-low"
      >
        {#each group.sections as section (section.route)}
          {@const summary = summaries[section.route]}
          <li
            class="relative ios:not-last:after:absolute ios:not-last:after:inset-s-ios-separator ios:not-last:after:inset-e-none ios:not-last:after:inset-be-none ios:not-last:after:border-be ios:not-last:after:border-ios-separator"
          >
            <Item look="settings-section">
              {#snippet child({ props })}
                <a href={resolve(section.route)} {...props}>
                  <ItemMedia
                    class={[
                      "rounded-tile bg-accent-soft text-accent block-tile inline-tile ios:rounded-settings-chip-ios ios:text-reader-white ios:block-settings-chip-ios ios:inline-settings-chip-ios android:rounded-full android:bg-android-tonal android:text-foreground android:block-settings-chip android:inline-settings-chip desktop:text-foreground",
                      IOS_CHIPS[section.chip],
                    ]}
                  >
                    <section.icon size={ICON_SIZE} />
                  </ItemMedia>
                  <ItemContent
                    class="ios:flex-row ios:flex-wrap ios:items-center ios:gap-x-sm ios:min-inline-none"
                  >
                    <ItemTitle
                      class="text-body ios:font-regular ios:min-inline-none desktop:text-callout desktop:font-medium"
                    >
                      {section.label()}
                    </ItemTitle>
                    {#if summary !== undefined}
                      <ItemDescription
                        lang={summary.lang}
                        class="text-footnote ios:flex-1 ios:truncate ios:text-end ios:text-body ios:min-inline-settings-value"
                        >{summary.text}</ItemDescription
                      >
                    {/if}
                  </ItemContent>
                  <ChevronRight
                    size={CHEVRON_SIZE}
                    class="shrink-0 text-muted rtl:-scale-x-100"
                  />
                </a>
              {/snippet}
            </Item>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
