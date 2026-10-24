<script lang="ts">
  import { ContextMenu } from "bits-ui";

  import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "./context-menu/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "./dropdown-menu/index.ts";
  import { Switch } from "./switch/index.ts";
  import { Tooltip } from "./tooltip/index.ts";
</script>

<p class="text-muted">Added Sep 21, 2026</p>
<Switch checked aria-label="Check folders" />
<Tooltip label="Rescan" aria-label="Rescan Sample Comics">R</Tooltip>
<DropdownMenu>
  <DropdownMenuTrigger>More</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Mark read</DropdownMenuItem>
    <DropdownMenuItem>Rename</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem tone="danger">Delete</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuRadioGroup value="grid">
      <DropdownMenuRadioItem value="grid">Grid</DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="list">List</DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  </DropdownMenuContent>
</DropdownMenu>
<ContextMenu.Root>
  <ContextMenu.Trigger>Cover</ContextMenu.Trigger>
  <ContextMenuContent>
    <ContextMenuItem>Open</ContextMenuItem>
    <ContextMenuSeparator />
    <ContextMenuItem>Remove</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu.Root>
