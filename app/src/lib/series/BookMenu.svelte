<script lang="ts">
  import { Ellipsis, Eye, EyeOff, Play } from "@lucide/svelte";

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
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { bookActions } from "./book-actions";

  const ICON_SIZE = 16;

  let {
    book,
    onMark,
  }: {
    book: SeriesBook;
    onMark: (mark: ReadMark) => void;
  } = $props();

  const actions = $derived(bookActions(book.reading));
</script>

<DropdownMenu>
  <Tooltip label={m.series_book_more_short()}>
    {#snippet child({ props: tip })}
      <DropdownMenuTrigger {...tip}>
        {#snippet child({ props })}
          <Button
            {...props}
            look="row-action"
            aria-label={m.series_book_more({ title: book.title })}
            class="block-pointer-target inline-pointer-target before:block-pointer-target before:inline-pointer-target"
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
        void goto(resolve("/read/[book]", { book: book.id }));
      }}
    >
      <Play size={ICON_SIZE} aria-hidden="true" />
      {actions.read === "continue"
        ? m.series_continue_reading()
        : m.series_start_reading()}
    </DropdownMenuItem>
    <DropdownMenuItem
      onSelect={() => {
        onMark(actions.mark);
      }}
    >
      {#if actions.mark === "read"}
        <Eye size={ICON_SIZE} aria-hidden="true" />
        {m.series_mark_read()}
      {:else}
        <EyeOff size={ICON_SIZE} aria-hidden="true" />
        {m.series_mark_unread()}
      {/if}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
