<script lang="ts">
  import {
    Ellipsis,
    Eye,
    FolderOpen,
    Library,
    RotateCcw,
  } from "@lucide/svelte";
  import { Dialog, DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "#lib/components/ui/dropdown-menu/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoon from "./ComingSoon.svelte";
  import { moreHeading } from "./more-heading.ts";
  import { READER_ICON_SIZE, readerButton } from "./reader-bar.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";

  const ITEM_ICON_SIZE = 16;
  const SHEET_ACTION =
    "flex items-center gap-md rounded-control px-md text-body font-medium min-block-touch-target hover:bg-hover";

  let {
    title,
    seriesTitle,
    pageNumber,
    pageCount,
    platform,
    onMarkRead,
    onStartOver,
    onOpenChange,
  }: {
    title: string;
    seriesTitle: string;
    pageNumber: number;
    pageCount: number;
    platform: Platform;
    onMarkRead: () => void;
    onStartOver: () => void;
    onOpenChange: (isOpen: boolean) => void;
  } = $props();

  const isWide = new MediaQuery(EXPANDED_QUERY);
  const chrome = getReaderChrome();
  const floats = $derived(chrome.floats);
  const isOnPhone = $derived(chrome.isOnPhone);
  const button = $derived(readerButton(platform, chrome.width));
  const heading = $derived(moreHeading(title, seriesTitle));
  const headingId = $props.id();
  let isSheetOpen = $state(false);
  const showFile = $derived(showFileLabel(platform));

  function closeSheet(): void {
    isSheetOpen = false;
    onOpenChange(false);
  }
</script>

{#if isWide.current || floats}
  <DropdownMenu {onOpenChange}>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          aria-label={m.reader_more()}
          class={button}
        >
          <ReaderIcon
            name="ellipsis"
            fallback={Ellipsis}
            isKit={isOnPhone}
            size={READER_ICON_SIZE}
          />
        </Button>
      {/snippet}
    </DropdownMenuTrigger>
    <DropdownMenuContent
      to="main"
      align="end"
      class={cn("min-inline-book-menu", floats && "max-inline-book-menu-max")}
    >
      {#if floats}
        <div
          id={headingId}
          aria-hidden="true"
          class="flex flex-col px-native-menu-item-inline py-xs text-footnote text-muted min-inline-none"
        >
          <span class="text-native-on-menu tabular-nums">
            {m.reader_page_of({ page: pageNumber, count: pageCount })}
          </span>
          <span class="flex gap-2xs min-inline-none">
            <span class="truncate">{heading.lead}</span>
            {#if heading.tail !== ""}
              <span class="shrink-0 whitespace-nowrap">{heading.tail}</span>
            {/if}
          </span>
        </div>
      {/if}
      <DropdownMenuPrimitive.Group
        aria-labelledby={floats ? headingId : undefined}
        class="flex flex-col"
      >
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
        {#if chrome.isOnPhone}
          <DropdownMenuSeparator />
        {:else}
          <hr class="-mx-xs my-xs border-border" />
        {/if}
        <DropdownMenuItem>
          {#snippet child({ props })}
            <a {...props} href={resolve("/(app)")}>
              <Library size={ITEM_ICON_SIZE} aria-hidden="true" />
              {m.reader_back_label()}
            </a>
          {/snippet}
        </DropdownMenuItem>
      </DropdownMenuPrimitive.Group>
    </DropdownMenuContent>
  </DropdownMenu>
{:else}
  <Button
    type="button"
    look="icon"
    aria-label={m.reader_more()}
    aria-haspopup="dialog"
    aria-expanded={isSheetOpen}
    class={button}
    onclick={() => {
      isSheetOpen = true;
      onOpenChange(true);
    }}
  >
    <ReaderIcon
      name="ellipsis"
      fallback={Ellipsis}
      isKit={isOnPhone}
      size={READER_ICON_SIZE}
    />
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
