<script lang="ts">
  import { FolderOpen, Trash } from "@lucide/svelte";

  import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "#lib/components/ui/context-menu/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { PickedSeriesActions } from "./series-menu";

  const MENU_ICON_SIZE = 16;

  let {
    actions,
    count,
    showInFolderLabel,
  }: {
    actions: PickedSeriesActions;
    count: number;
    showInFolderLabel: string;
  } = $props();
</script>

<ContextMenuContent to="main" class="min-inline-book-menu">
  <ContextMenuItem onSelect={actions.onShowInFolder}>
    <FolderOpen size={MENU_ICON_SIZE} aria-hidden="true" />
    {showInFolderLabel}
  </ContextMenuItem>
  <ContextMenuSeparator />
  <ContextMenuItem onSelect={actions.onRemove}>
    <Trash size={MENU_ICON_SIZE} aria-hidden="true" />
    {m.library_remove_picked_from_library({ count })}
  </ContextMenuItem>
</ContextMenuContent>
