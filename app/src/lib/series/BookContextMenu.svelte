<script lang="ts">
  import {
    Bookmark,
    Eye,
    EyeOff,
    FolderOpen,
    Play,
    Trash,
  } from "@lucide/svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import {
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
  } from "#lib/components/ui/context-menu/index.ts";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { bookActions } from "./book-actions";
  import { bookSummary } from "./book-reading";

  const ICON_SIZE = 16;

  let {
    book,
    onMark,
    onBookmark,
    onShowInFolder,
    onDelete,
  }: {
    book: SeriesBook;
    onMark: (mark: ReadMark) => void;
    onBookmark?: (() => void) | undefined;
    onShowInFolder?: (() => void) | undefined;
    onDelete?: (() => void) | undefined;
  } = $props();

  const actions = $derived(bookActions(book.reading));
</script>

<ContextMenuContent
  to="main"
  aria-label={m.series_book_context_menu({
    book: book.title,
    reading: bookSummary(book),
  })}
  class="min-inline-book-menu"
>
  <ContextMenuItem
    onSelect={() => {
      void goto(resolve("/read/[book]", { book: book.id }));
    }}
  >
    <Play size={ICON_SIZE} aria-hidden="true" />
    {actions.read === "continue"
      ? m.series_continue_reading()
      : m.series_start_reading()}
  </ContextMenuItem>
  <ContextMenuItem
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
  </ContextMenuItem>
  {#if onBookmark !== undefined && !book.isBookmarked}
    <ContextMenuItem onSelect={onBookmark}>
      <Bookmark size={ICON_SIZE} aria-hidden="true" />
      {m.series_bookmark()}
    </ContextMenuItem>
  {/if}
  {#if onShowInFolder !== undefined}
    <ContextMenuSeparator />
    <ContextMenuItem onSelect={onShowInFolder}>
      <FolderOpen size={ICON_SIZE} aria-hidden="true" />
      {showFileLabel(currentPlatform())}
    </ContextMenuItem>
  {/if}
  {#if onDelete !== undefined}
    {#if onShowInFolder === undefined}
      <ContextMenuSeparator />
    {/if}
    <ContextMenuItem
      tone={currentPlatform() === "linux" ? "danger" : "plain"}
      onSelect={onDelete}
    >
      <Trash size={ICON_SIZE} aria-hidden="true" />
      {m.library_delete()}
    </ContextMenuItem>
  {/if}
</ContextMenuContent>
