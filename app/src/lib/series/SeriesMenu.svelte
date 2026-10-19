<script lang="ts">
  import { Ellipsis, Eye, EyeOff } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SERIES_CHIP } from "./series-chip.ts";

  const ICON_SIZE = 20;
  const ITEM_ICON_SIZE = 16;

  let {
    title,
    onMarkAll,
  }: { title: string; onMarkAll: (mark: ReadMark) => Promise<void> } = $props();
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        look="icon"
        aria-label={m.series_book_more({ title })}
        class={SERIES_CHIP}
      >
        <Ellipsis size={ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent to="main" align="end">
    <DropdownMenuItem
      onSelect={() => {
        void onMarkAll("read");
      }}
    >
      <Eye size={ITEM_ICON_SIZE} aria-hidden="true" />
      {m.series_mark_every_read()}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => {
        void onMarkAll("unread");
      }}
    >
      <EyeOff size={ITEM_ICON_SIZE} aria-hidden="true" />
      {m.series_mark_every_unread()}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
