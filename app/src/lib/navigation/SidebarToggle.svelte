<script lang="ts">
  import { PanelLeft } from "@lucide/svelte";

  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { getSidebarSetting } from "./sidebar.svelte.ts";

  const ICON_SIZE = 16;

  const sidebar = getSidebarSetting();
  const label = $derived(
    sidebar.isHidden ? m.sidebar_show() : m.sidebar_hide(),
  );
</script>

<Tooltip
  {label}
  aria-label={label}
  class="flex shrink-0 items-center justify-center rounded-sidebar-row text-foreground transition-control block-sidebar-row inline-sidebar-row hover:bg-hover active:bg-pressed"
  onclick={() => {
    sidebar.toggle();
  }}
>
  <PanelLeft size={ICON_SIZE} aria-hidden="true" />
</Tooltip>
