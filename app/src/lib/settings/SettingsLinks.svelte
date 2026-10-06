<script lang="ts" module>
  import type { Pathname } from "$app/types";

  export interface SettingsLink {
    readonly route: Pathname;
    readonly label: string;
    readonly value?: string;
  }
</script>

<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  let { links }: { readonly links: readonly SettingsLink[] } = $props();

  const CHEVRON_SIZE = 20;
</script>

<ul
  class="mbs-xl divide-y divide-border rounded-card border border-border bg-card"
>
  {#each links as link (link.route)}
    <li class="group">
      <a
        href={resolve(link.route)}
        class="flex items-center gap-sm px-lg transition-colors min-block-touch-target group-first:rounded-ss-card group-first:rounded-se-card group-last:rounded-ee-card group-last:rounded-es-card hover:bg-hover active:bg-pressed motion-safe:duration-fade motion-safe:ease-out"
      >
        <span class="flex-1">{link.label}</span>
        {#if link.value !== undefined}
          <span class="text-muted">{link.value}</span>
        {/if}
        <ChevronRight size={CHEVRON_SIZE} class="text-muted rtl:-scale-x-100" />
      </a>
    </li>
  {/each}
</ul>
