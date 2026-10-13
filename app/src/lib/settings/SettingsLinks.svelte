<script lang="ts" module>
  import type { SettingsPage } from "./sections";

  export interface SettingsLink {
    readonly route: SettingsPage;
    readonly label: string;
    readonly value?: string;
  }
</script>

<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { Item, ItemDescription } from "#lib/components/ui/item/index.ts";

  let { links }: { readonly links: readonly SettingsLink[] } = $props();

  const CHEVRON_SIZE = 20;
</script>

<ul
  class="mbs-xl divide-y divide-border rounded-card border border-border bg-card"
>
  {#each links as link (link.route)}
    <li class="group">
      <Item look="settings-link">
        {#snippet child({ props })}
          <a href={resolve(link.route)} {...props}>
            <span class="flex-1">{link.label}</span>
            {#if link.value !== undefined}
              <ItemDescription>{link.value}</ItemDescription>
            {/if}
            <ChevronRight
              size={CHEVRON_SIZE}
              class="text-muted rtl:-scale-x-100"
            />
          </a>
        {/snippet}
      </Item>
    </li>
  {/each}
</ul>
