<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { drawAndroidListsWith } from "#lib/settings/android-list-look.svelte.ts";
  import { pagesListLook } from "#lib/settings/pages-list-look.ts";
  import {
    SETTINGS_SECTIONS,
    sectionCurrent,
    sectionsShown,
  } from "#lib/settings/sections.ts";

  import type { LayoutProps } from "./$types";

  let { children }: LayoutProps = $props();

  const ICON_SIZE = 18;

  const look = pagesListLook(currentPlatform());
  const android = new AndroidPhone();
  drawAndroidListsWith({ isOn: currentPlatform() === "android" });
</script>

<div
  class="flex flex-1 flex-col two-pane:-mx-gutter two-pane:-mbs-page-top two-pane:-mbe-page-bottom two-pane:flex-row"
>
  <div class={look.sidebar}>
    {#if look.caption !== undefined}
      <p class={look.caption}>
        {m.settings_title()}
      </p>
    {/if}
    <nav aria-label={m.settings_sections_label()} class={look.nav}>
      <ul class={look.list}>
        {#each sectionsShown(SETTINGS_SECTIONS, android.isOn) as section (section.route)}
          {@const current = sectionCurrent(
            page.url.pathname,
            resolve(section.route),
          )}
          <li>
            <a
              href={resolve(section.route)}
              aria-current={current}
              class={[
                look.row,
                current !== undefined ? look.rowOpen : look.rowIdle,
              ]}
            >
              <section.icon size={ICON_SIZE} class={look.icon} />
              <span
                data-label={section.label()}
                class="room-for-bold-label min-inline-none"
                >{section.label()}</span
              >
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </div>
  <div
    class="flex flex-1 flex-col min-inline-none two-pane:px-pane two-pane:pbs-page-top two-pane:pbe-xl android:two-pane:overflow-x-clip android:two-pane:ps-page-start android:two-pane:pe-page-end"
  >
    <div class={["flex flex-1 flex-col", look.page]}>
      {@render children()}
    </div>
  </div>
</div>
