<script lang="ts">
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages.js";
  import { SETTINGS_GROUPS } from "$lib/settings/sections";

  let { children }: { children: Snippet } = $props();

  const ICON_SIZE = 18;
</script>

<div
  class="flex flex-1 flex-col expanded:-mx-gutter expanded:-my-xl expanded:flex-row"
>
  <div
    class="hidden shrink-0 flex-col gap-lg border-e border-border px-md pbs-xl expanded:flex expanded:inline-settings-list"
  >
    <p class="px-md text-page-title font-bold tracking-tight">
      {m.settings_title()}
    </p>
    <nav aria-label={m.settings_sections_label()}>
      {#each SETTINGS_GROUPS as group, index (index)}
        {#if index > 0}
          <hr class="mx-md my-sm border-border" />
        {/if}
        <ul class="flex flex-col gap-2xs">
          {#each group as section (section.route)}
            {@const isOpen = page.url.pathname === resolve(section.route)}
            <li>
              <a
                href={resolve(section.route)}
                aria-current={isOpen ? "page" : undefined}
                class={[
                  "flex items-center gap-md rounded-control px-md text-label min-block-touch-target",
                  isOpen
                    ? "bg-accent-soft font-semibold text-foreground"
                    : "font-medium text-sidebar-ink",
                ]}
              >
                <section.icon size={ICON_SIZE} />
                {section.label()}
              </a>
            </li>
          {/each}
        </ul>
      {/each}
    </nav>
  </div>
  <div
    class="flex flex-1 flex-col expanded:px-pane expanded:pbs-xl expanded:pbe-xl"
  >
    <div class="flex flex-1 flex-col expanded:max-inline-section">
      {@render children()}
    </div>
  </div>
</div>
