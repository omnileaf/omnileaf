<script lang="ts">
  import {
    Ellipsis,
    Eye,
    EyeOff,
    FolderOpen,
    Pencil,
    Tags,
  } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import type { ReadMark } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { barChip } from "./series-chip.ts";

  const ICON_SIZE = 20;
  const ITEM_ICON_SIZE = 16;

  let {
    title,
    onMarkAll,
    onLabel,
    onEditDetails,
    showFolder,
  }: {
    title: string;
    onMarkAll: (mark: ReadMark) => Promise<void>;
    onLabel: (() => void) | undefined;
    onEditDetails: (() => void) | undefined;
    showFolder: {
      readonly label: string;
      readonly onShow: (() => void) | undefined;
    };
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
</script>

<DropdownMenu>
  <DropdownMenuTrigger>
    {#snippet child({ props })}
      <Button
        {...props}
        look="icon"
        aria-label={m.series_book_more({ title })}
        class={barChip(platform, width.current)}
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
    {#if onLabel !== undefined || onEditDetails !== undefined}
      <DropdownMenuSeparator />
    {/if}
    {#if onLabel !== undefined}
      <DropdownMenuItem onSelect={onLabel}>
        <Tags size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.library_labels_menu()}
      </DropdownMenuItem>
    {/if}
    {#if onEditDetails !== undefined}
      <DropdownMenuItem onSelect={onEditDetails}>
        <Pencil size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.edit_details_menu()}
      </DropdownMenuItem>
    {/if}
    <DropdownMenuSeparator />
    {#if showFolder.onShow === undefined}
      <DropdownMenuItem disabled>
        <FolderOpen size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.reader_coming_soon({ feature: showFolder.label })}
      </DropdownMenuItem>
    {:else}
      <DropdownMenuItem onSelect={showFolder.onShow}>
        <FolderOpen size={ITEM_ICON_SIZE} aria-hidden="true" />
        {showFolder.label}
      </DropdownMenuItem>
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
