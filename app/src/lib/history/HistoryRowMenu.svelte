<script lang="ts">
  import { BookOpen, Ellipsis, ListOrdered } from "@lucide/svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;

  let {
    entry,
    onOpenSessions,
  }: { entry: HistoryEntry; onOpenSessions: () => void } = $props();
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
            class="relative block-pointer-target inline-pointer-target before:block-pointer-target before:inline-pointer-target"
          >
            <Ellipsis size={ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
    {/snippet}
  </Tooltip>
  <DropdownMenuContent to="main" align="end" class="min-inline-book-menu">
    <DropdownMenuItem onSelect={onOpenSessions}>
      <ListOrdered size={ICON_SIZE} aria-hidden="true" />
      {m.history_reading_sessions()}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => {
        void goto(resolve("/(app)/series/[id]", { id: entry.series }));
      }}
    >
      <BookOpen size={ICON_SIZE} aria-hidden="true" />
      {m.history_open_series()}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
