<script lang="ts">
  import { Menu } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { variantClasses } from "#lib/components/ui/button/looks.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { shownKeys } from "#lib/screenshot-mode/key-combination.ts";

  import { PANE_SHORTCUT, paneShortcutKeys } from "./pane-shortcut.ts";
  import { getSidebarSetting } from "./sidebar.svelte.ts";

  const ICON_SIZE = 16;

  const sidebar = getSidebarSetting();
  const label = $derived(
    sidebar.isHidden ? m.sidebar_show() : m.sidebar_hide(),
  );
</script>

<Tooltip
  {label}
  keys={shownKeys(PANE_SHORTCUT, "windows")}
  aria-label={label}
  aria-keyshortcuts={paneShortcutKeys("windows")}
  class={cn(
    variantClasses("plain", "regular", true, "windows"),
    "shrink-0 block-pointer-button inline-pointer-target compact-pane:invisible",
  )}
  onclick={() => {
    sidebar.toggle();
  }}
>
  <Menu size={ICON_SIZE} aria-hidden="true" />
</Tooltip>
