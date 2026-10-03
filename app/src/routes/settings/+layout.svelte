<script lang="ts">
  import type { Snippet } from "svelte";

  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { m } from "$lib/paraglide/messages.js";
  import { SETTINGS_GROUPS, sectionCurrent } from "$lib/settings/sections";

  let { children }: { children: Snippet } = $props();

  const ICON_SIZE = 18;
</script>

<div
  class="flex flex-1 flex-col two-pane:-mx-gutter two-pane:-mbs-page-top two-pane:-mbe-page-bottom two-pane:flex-row"
>
  <div
    class="hidden shrink-0 flex-col gap-lg border-e border-border px-md pbs-page-top pbe-xl two-pane:flex two-pane:inline-settings-list"
  >
    <p
      class="mbe-xs px-md text-page-title font-bold tracking-tight wrap-break-word hyphens-auto"
    >
      {m.settings_title()}
    </p>
    <nav aria-label={m.settings_sections_label()} class="flex flex-col gap-lg">
      {#each SETTINGS_GROUPS as group, index (index)}
        <ul class="flex flex-col gap-2xs">
          {#each group as section (section.route)}
            {@const current = sectionCurrent(
              page.url.pathname,
              resolve(section.route),
            )}
            <li>
              <a
                href={resolve(section.route)}
                aria-current={current}
                class={[
                  "flex items-center gap-md rounded-control px-md text-label min-block-touch-target desktop:min-block-settings-row",
                  current !== undefined
                    ? "bg-accent-soft font-bold text-accent"
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
    class="flex flex-1 flex-col two-pane:px-pane two-pane:pbs-page-top two-pane:pbe-xl"
  >
    <div class="flex flex-1 flex-col two-pane:max-inline-section">
      {@render children()}
    </div>
  </div>
</div>
