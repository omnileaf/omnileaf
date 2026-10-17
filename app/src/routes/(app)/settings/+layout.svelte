<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { m } from "#lib/paraglide/messages.js";
  import { SETTINGS_SECTIONS, sectionCurrent } from "#lib/settings/sections.ts";

  import type { LayoutProps } from "./$types";

  let { children }: LayoutProps = $props();

  const ICON_SIZE = 18;
</script>

<div
  class="flex flex-1 flex-col two-pane:-mx-gutter two-pane:-mbs-page-top two-pane:-mbe-page-bottom two-pane:flex-row"
>
  <div
    class="hidden shrink-0 flex-col gap-lg border-e border-border px-md pbs-page-top pbe-xl two-pane:flex two-pane:inline-fit two-pane:max-inline-settings-list-widest two-pane:min-inline-settings-list"
  >
    <p
      class="mbe-xs px-md text-page-title font-bold tracking-tight wrap-break-word desktop:mbe-none desktop:px-sm desktop:text-caption desktop:font-medium desktop:tracking-normal desktop:text-muted"
    >
      {m.settings_title()}
    </p>
    <nav
      aria-label={m.settings_sections_label()}
      class="flex flex-col gap-lg desktop:-mbs-md desktop:gap-2xs"
    >
      <ul class="flex flex-col gap-2xs">
        {#each SETTINGS_SECTIONS as section (section.route)}
          {@const current = sectionCurrent(
            page.url.pathname,
            resolve(section.route),
          )}
          <li>
            <a
              href={resolve(section.route)}
              aria-current={current}
              class={[
                "flex items-center gap-md rounded-row px-md text-label transition-control min-block-touch-target desktop:gap-sm desktop:rounded-sidebar-row desktop:px-sm desktop:text-small desktop:min-block-sidebar-row",
                current !== undefined
                  ? "bg-accent-soft font-bold text-accent desktop:bg-sidebar-accent desktop:font-medium desktop:text-on-sidebar-accent"
                  : "font-medium text-sidebar-ink hover:bg-hover active:bg-pressed desktop:font-regular",
              ]}
            >
              <section.icon
                size={ICON_SIZE}
                class="shrink-0 desktop:block-sidebar-icon desktop:inline-sidebar-icon"
              />
              <span
                data-label={section.label()}
                class="room-for-bold-label wrap-break-word min-inline-none"
                >{section.label()}</span
              >
            </a>
          </li>
        {/each}
      </ul>
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
