<script lang="ts">
  import { Menu } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { windowsButtonClasses } from "#lib/components/ui/button/windows-button.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";
  import {
    type KeyCombination,
    shownKeys,
  } from "#lib/screenshot-mode/key-combination.ts";

  import { getSidebarSetting } from "./sidebar.svelte.ts";

  const ICON_SIZE = 16;
  const TOGGLE_KEYS: KeyCombination = { letter: "B", shift: false };
  const TOGGLE_ARIA_KEYS = "Control+B";

  const sidebar = getSidebarSetting();
  const label = $derived(
    sidebar.isHidden ? m.sidebar_show() : m.sidebar_hide(),
  );
</script>

<Tooltip
  {label}
  keys={shownKeys(TOGGLE_KEYS, "windows")}
  aria-label={label}
  aria-keyshortcuts={TOGGLE_ARIA_KEYS}
  class={cn(
    windowsButtonClasses("plain", "regular", true),
    "shrink-0 block-pointer-button inline-pointer-target compact-pane:invisible",
  )}
  onclick={() => {
    sidebar.toggle();
  }}
>
  <Menu size={ICON_SIZE} aria-hidden="true" />
</Tooltip>
