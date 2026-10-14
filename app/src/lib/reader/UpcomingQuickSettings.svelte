<script lang="ts">
  import {
    Columns2,
    type LucideProps,
    MoveVertical,
    Sun,
  } from "@lucide/svelte";
  import type { Component } from "svelte";

  import { m } from "#lib/paraglide/messages.js";

  import ComingSoon from "#lib/reader/ComingSoon.svelte";
  import {
    QUICK_SETTING_ICON_SIZE,
    QUICK_SETTING_LOOK,
  } from "#lib/reader/quick-setting.ts";

  interface UpcomingSetting {
    readonly label: () => string;
    readonly icon: Component<LucideProps>;
  }

  const UPCOMING: readonly UpcomingSetting[] = [
    { label: m.reader_two_pages, icon: Columns2 },
    { label: m.reader_fit_height, icon: MoveVertical },
    { label: m.reader_light, icon: Sun },
  ];
</script>

{#each UPCOMING as setting (setting.label)}
  <ComingSoon label={setting.label()} class={QUICK_SETTING_LOOK}>
    <setting.icon
      size={QUICK_SETTING_ICON_SIZE}
      aria-hidden="true"
      class="shrink-0"
    />
    {setting.label()}
  </ComingSoon>
{/each}
