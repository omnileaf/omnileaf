<script lang="ts">
  import {
    Ellipsis,
    Eye,
    FolderOpen,
    Library,
    RotateCcw,
  } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoon from "./ComingSoon.svelte";
  import { READER_BUTTON, READER_ICON_SIZE } from "./reader-bar.ts";

  const ITEM_ICON_SIZE = 16;
  const SHEET_ACTION =
    "flex items-center gap-md rounded-control px-md text-body font-medium min-block-touch-target hover:bg-hover";
  const TOUCH: readonly Platform[] = ["android", "ios"];

  let {
    title,
    platform,
    onMarkRead,
    onStartOver,
    onOpenChange,
  }: {
    title: string;
    platform: Platform;
    onMarkRead: () => void;
    onStartOver: () => void;
    onOpenChange: (isOpen: boolean) => void;
  } = $props();

  const isWide = new MediaQuery(EXPANDED_QUERY);
  let isSheetOpen = $state(false);
  const showFile = $derived(
    TOUCH.includes(platform) ? m.reader_show_file() : m.reader_show_in_folder(),
  );

  function closeSheet(): void {
    isSheetOpen = false;
    onOpenChange(false);
  }
</script>

{#if isWide.current}
  <DropdownMenu {onOpenChange}>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          aria-label={m.reader_more()}
          class={READER_BUTTON}
        >
          <Ellipsis size={READER_ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent to="main" align="end" class="min-inline-book-menu">
      <DropdownMenuItem onSelect={onMarkRead}>
        <Eye size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.reader_mark_read()}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onStartOver}>
        <RotateCcw size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.reader_start_over()}
      </DropdownMenuItem>
      <DropdownMenuItem disabled>
        <FolderOpen size={ITEM_ICON_SIZE} aria-hidden="true" />
        {m.reader_coming_soon({ feature: showFile })}
      </DropdownMenuItem>
      <hr class="-mx-xs my-xs border-border" />
      <DropdownMenuItem>
        {#snippet child({ props })}
          <a {...props} href={resolve("/(app)")}>
            <Library size={ITEM_ICON_SIZE} aria-hidden="true" />
            {m.reader_back_label()}
          </a>
        {/snippet}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
{:else}
  <Button
    type="button"
    look="icon"
    aria-label={m.reader_more()}
    aria-haspopup="dialog"
    aria-expanded={isSheetOpen}
    class={READER_BUTTON}
    onclick={() => {
      isSheetOpen = true;
      onOpenChange(true);
    }}
  >
    <Ellipsis size={READER_ICON_SIZE} aria-hidden="true" />
  </Button>
  <Dialog.Root bind:open={isSheetOpen}>
    <DrawerContent onDismiss={closeSheet} to="main">
      <DialogTitle class="px-sheet-inline pbs-sheet-gap text-title font-bold">
        {title}
      </DialogTitle>
      <div class="flex flex-col px-sm pbs-sm pbe-sheet-bottom">
        <Button
          type="button"
          look="row"
          class={SHEET_ACTION}
          onclick={() => {
            closeSheet();
            onMarkRead();
          }}
        >
          <Eye size={READER_ICON_SIZE} aria-hidden="true" />
          {m.reader_mark_read()}
        </Button>
        <Button
          type="button"
          look="row"
          class={SHEET_ACTION}
          onclick={() => {
            closeSheet();
            onStartOver();
          }}
        >
          <RotateCcw size={READER_ICON_SIZE} aria-hidden="true" />
          {m.reader_start_over()}
        </Button>
        <ComingSoon label={showFile} class={cn(SHEET_ACTION, "text-muted")}>
          <FolderOpen size={READER_ICON_SIZE} aria-hidden="true" />
          {showFile}
        </ComingSoon>
        <hr class="my-xs border-border" />
        <a href={resolve("/(app)")} class={SHEET_ACTION}>
          <Library size={READER_ICON_SIZE} aria-hidden="true" />
          {m.reader_back_label()}
        </a>
      </div>
    </DrawerContent>
  </Dialog.Root>
{/if}
