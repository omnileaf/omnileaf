<script lang="ts">
  import { Eye, FolderOpen, Tags, Trash } from "@lucide/svelte";

  import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "#lib/components/ui/context-menu/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { MENU_ICON_SIZE, type PickedSeriesActions } from "./series-menu";

  let {
    actions,
    count,
    canLabel,
    showInFolderLabel,
  }: {
    actions: PickedSeriesActions;
    count: number;
    canLabel: boolean;
    showInFolderLabel: string;
  } = $props();
</script>

<ContextMenuContent to="main" class="min-inline-book-menu">
  <ContextMenuItem onSelect={actions.onMarkRead}>
    <Eye size={MENU_ICON_SIZE} aria-hidden="true" />
    {m.library_mark_read()}
  </ContextMenuItem>
  {#if canLabel}
    <ContextMenuSeparator />
    <ContextMenuItem onSelect={actions.onLabel}>
      <Tags size={MENU_ICON_SIZE} aria-hidden="true" />
      {m.library_labels_menu()}
    </ContextMenuItem>
  {/if}
  <ContextMenuSeparator />
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
