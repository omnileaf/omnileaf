<script lang="ts">
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
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
  </DropdownMenuContent>
</DropdownMenu>
