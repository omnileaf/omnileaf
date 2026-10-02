<script lang="ts">
  import { ChevronRight } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { m } from "$lib/paraglide/messages.js";

  const CHEVRON_SIZE = 20;

  const SETTINGS_PAGES = [
    { route: "/settings/library", label: m.library_title },
    { route: "/settings/appearance", label: m.appearance_title },
    { route: "/settings/about", label: m.about_title },
  ] as const;
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.settings_title()}</h1>
<ul
  class="mbs-xl divide-y divide-border rounded-card border border-border bg-card"
>
  {#each SETTINGS_PAGES as settingsPage (settingsPage.route)}
    <li>
      <a
        href={resolve(settingsPage.route)}
        class="flex items-center justify-between px-lg min-block-touch-target"
      >
        {settingsPage.label()}
        <ChevronRight size={CHEVRON_SIZE} class="text-muted" />
      </a>
    </li>
  {/each}
</ul>
