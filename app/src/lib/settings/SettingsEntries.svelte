<script lang="ts" module>
  import type { IconName } from "#lib/icons/names.ts";
  import type { Glyph } from "#lib/page/glyph.ts";

  import type { SettingsPage } from "./sections";

  export interface SettingsEntry {
    readonly route: SettingsPage;
    readonly icon: Glyph;
    readonly iconName: IconName;
    readonly label: string;
    readonly summary?: string;
  }
</script>

<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";

  import { FLUSH_LIST } from "./android-flush-look.ts";

  let { entries }: { readonly entries: readonly SettingsEntry[] } = $props();

  const ICON_SIZE = 18;
  const CHEVRON_SIZE = 18;
  const TODAYS_LIST =
    "divide-y divide-border overflow-hidden rounded-list border border-border bg-card";

  const android = new AndroidPhone();
</script>

{#if android.isOn}
  <ul class={FLUSH_LIST}>
    {#each entries as entry (entry.route)}
      <li>
        <Item look="row">
          {#snippet child({ props })}
            <a href={resolve(entry.route)} {...props}>
              <Icon name={entry.iconName} class="shrink-0" />
              <ItemContent>
                <ItemTitle>{entry.label}</ItemTitle>
                {#if entry.summary !== undefined}
                  <ItemDescription>{entry.summary}</ItemDescription>
                {/if}
              </ItemContent>
            </a>
          {/snippet}
        </Item>
      </li>
    {/each}
  </ul>
{:else}
  <ul class={[TODAYS_LIST, GROUP_PLATE]}>
    {#each entries as entry (entry.route)}
      <li>
        <a
          href={resolve(entry.route)}
          class={[
            "group flex items-center gap-md py-xs ps-lg pe-md transition-control min-block-phone-row hover:bg-hover active:bg-pressed",
            "touch:medium:py-none touch:medium:ps-list-row touch:medium:min-block-touch-target",
            "desktop:py-md desktop:ps-list-row desktop:min-block-settings-row",
          ]}
        >
          <span
            aria-hidden="true"
            class="flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile"
          >
            <entry.icon size={ICON_SIZE} />
          </span>
          <span
            class="flex flex-1 flex-col gap-2xs min-inline-none desktop:gap-xs"
          >
            <span class="font-semibold desktop:text-label desktop:font-medium"
              >{entry.label}</span
            >
            {#if entry.summary !== undefined}
              <span
                class="text-detail text-muted group-hover:text-foreground desktop:text-label"
                >{entry.summary}</span
              >
            {/if}
          </span>
          <ChevronRight
            size={CHEVRON_SIZE}
            aria-hidden="true"
            class="shrink-0 text-muted rtl:-scale-x-100"
          />
        </a>
      </li>
    {/each}
  </ul>
{/if}
