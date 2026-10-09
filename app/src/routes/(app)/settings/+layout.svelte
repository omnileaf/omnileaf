<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { m } from "#lib/paraglide/messages.js";
  import { sectionCurrent, settingsGroups } from "#lib/settings/sections.ts";

  import type { LayoutProps } from "./$types";

  let { data, children }: LayoutProps = $props();

  const groups = $derived(settingsGroups(data.appInfo));

  const ICON_SIZE = 18;
</script>

<div
  class="flex flex-1 flex-col two-pane:-mx-gutter two-pane:-mbs-page-top two-pane:-mbe-page-bottom two-pane:flex-row"
>
  <div
    class="hidden shrink-0 flex-col gap-lg border-e border-border px-md pbs-page-top pbe-xl two-pane:flex two-pane:inline-fit two-pane:max-inline-settings-list-widest two-pane:min-inline-settings-list"
  >
    <p
      class="mbe-xs px-md text-page-title font-bold tracking-tight wrap-break-word"
    >
      {m.settings_title()}
    </p>
    <nav aria-label={m.settings_sections_label()} class="flex flex-col gap-lg">
      {#each groups as group, index (index)}
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
                  "flex items-center gap-md rounded-row px-md text-label transition-control min-block-touch-target desktop:min-block-settings-row",
                  current !== undefined
                    ? "bg-accent-soft font-bold text-accent"
                    : "font-medium text-sidebar-ink hover:bg-hover active:bg-pressed",
                ]}
              >
                <section.icon size={ICON_SIZE} class="shrink-0" />
                <span class="wrap-break-word min-inline-none"
                  >{section.label()}</span
                >
              </a>
            </li>
          {/each}
        </ul>
      {/each}
    </nav>
  </div>
  <div
    class="flex flex-1 flex-col min-inline-none two-pane:px-pane two-pane:pbs-page-top two-pane:pbe-xl"
  >
    <div class="flex flex-1 flex-col two-pane:max-inline-section">
      {@render children()}
    </div>
  </div>
</div>
