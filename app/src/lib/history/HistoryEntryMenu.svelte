<script lang="ts">
  import { Ellipsis, LibraryBig, Play, X } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { HistoryEntryActions } from "./history-entry-actions.ts";

  const ICON_SIZE = 16;

  let {
    entry,
    actions,
  }: { entry: HistoryEntry; actions: HistoryEntryActions } = $props();
</script>

<DropdownMenu>
  <Tooltip label={m.history_more_short()}>
    {#snippet child({ props: tip })}
      <DropdownMenuTrigger {...tip}>
        {#snippet child({ props })}
          <Button
            {...props}
            look="row-action"
            aria-label={m.history_more({ book: entry.bookTitle })}
            class="relative hidden block-pointer-target inline-pointer-target before:block-pointer-target before:inline-pointer-target large:flex"
          >
            <Ellipsis size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
    {/snippet}
  </Tooltip>
  <DropdownMenuContent to="main" align="end" class="min-inline-book-menu">
    <DropdownMenuItem
      onSelect={() => {
        actions.continueReading(entry);
      }}
    >
      <Play size={ICON_SIZE} aria-hidden="true" />
      {m.history_continue_reading()}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => {
        actions.openSeries(entry);
      }}
    >
      <LibraryBig size={ICON_SIZE} aria-hidden="true" />
      {m.history_open_the_series()}
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onSelect={() => {
        actions.remove(entry);
      }}
    >
      <X size={ICON_SIZE} aria-hidden="true" />
      <span class="flex-1">{m.history_remove()}</span>
      <Kbd aria-hidden="true">{m.history_remove_shortcut()}</Kbd>
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
