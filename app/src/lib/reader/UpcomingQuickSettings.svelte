<script lang="ts">
  import { Columns2, type LucideProps, MoveVertical } from "@lucide/svelte";
  import type { Component } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoon from "#lib/reader/ComingSoon.svelte";
  import {
    QUICK_SETTING_ICON_SIZE,
    QUICK_SETTING_LOOK,
  } from "#lib/reader/quick-setting.ts";

  interface UpcomingSetting {
    readonly label: () => string;
    readonly icon: Component<LucideProps>;
    readonly isDesktopOnly: boolean;
  }

  const UPCOMING: readonly UpcomingSetting[] = [
    { label: m.reader_two_pages, icon: Columns2, isDesktopOnly: false },
    { label: m.reader_fit_height, icon: MoveVertical, isDesktopOnly: true },
  ];
</script>

{#each UPCOMING as setting (setting.label)}
  <ComingSoon
    label={setting.label()}
    class={cn(
      QUICK_SETTING_LOOK,
      "text-muted hover:bg-transparent",
      setting.isDesktopOnly && "max-expanded:hidden",
    )}
  >
    <setting.icon
      size={QUICK_SETTING_ICON_SIZE}
      aria-hidden="true"
      class="shrink-0"
    />
    {setting.label()}
  </ComingSoon>
{/each}
