<script lang="ts">
  import {
    Ellipsis,
    Eye,
    FolderOpen,
    Library,
    type LucideProps,
    RotateCcw,
  } from "@lucide/svelte";
  import { Dialog, DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { Component } from "svelte";
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
  import { Item, ItemTitle } from "#lib/components/ui/item/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { takeBackWithinScreen } from "#lib/navigation/back-within-screen.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { showFileLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { moreHeading } from "./more-heading.ts";
  import {
    READER_ICON_SIZE,
    readerButton,
    readerIconSize,
  } from "./reader-bar.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderIcon from "./ReaderIcon.svelte";

  interface MoreAction {
    readonly icon: IconName;
    readonly fallback: Component<LucideProps>;
    readonly label: string;
    readonly act: () => void;
  }

  const ITEM_ICON_SIZE = 16;
  const SHEET = {
    heading: "text-title font-bold",
    list: "flex flex-col px-sm pbs-sm pbe-sheet-bottom",
    row: "reader-sheet-action",
    title: "font-medium",
    rule: "my-xs border-border",
    shape: "",
    wayBack: "",
  } as const;
  const PHONE_SHEET = {
    heading:
      "text-native-bar-title/native-bar-title font-native-bar-title tracking-native-bar-title",
    list: "flex flex-col pbs-sm pbe-sheet-bottom",
    row: "row",
    title: "",
    rule: "mx-lg my-sm border-native-menu-rule",
    shape: "rounded-native-menu-item",
    wayBack: "bg-native-row-pressed",
  } as const;

  let {
    title,
    seriesTitle,
    pageNumber,
    pageCount,
    platform,
    onMarkRead,
    onStartOver,
    onShowFile,
    onOpenChange,
  }: {
    title: string;
    seriesTitle: string;
    pageNumber: number;
    pageCount: number;
    platform: Platform;
    onMarkRead: () => void;
    onStartOver: () => void;
    onShowFile: (() => void) | undefined;
    onOpenChange: (isOpen: boolean) => void;
  } = $props();

  const isWide = new MediaQuery(EXPANDED_QUERY);
  const chrome = getReaderChrome();
  const floats = $derived(chrome.floats);
  const isOnPhone = $derived(chrome.isOnPhone);
  const button = $derived(readerButton(platform, chrome.width));
  const sheet = $derived(isOnPhone ? PHONE_SHEET : SHEET);
  const heading = $derived(moreHeading(title, seriesTitle));
  const headingId = $props.id();
  let isSheetOpen = $state(false);
  let isMenuOpen = $state(false);
  const showFile = $derived(showFileLabel(platform));
  const moreActions: readonly MoreAction[] = $derived([
    {
      icon: "eye",
      fallback: Eye,
      label: m.reader_mark_read(),
      act: onMarkRead,
    },
    {
      icon: "rotate-ccw",
      fallback: RotateCcw,
      label: m.reader_start_over(),
      act: onStartOver,
    },
    ...(onShowFile === undefined
      ? []
      : [
          {
            icon: "folder-open",
            fallback: FolderOpen,
            label: showFile,
            act: onShowFile,
          } satisfies MoreAction,
        ]),
  ]);

  function closeSheet(): void {
    isSheetOpen = false;
    onOpenChange(false);
  }

  function closeMenu(): void {
    isMenuOpen = false;
    onOpenChange(false);
  }

  function closesWhenGone(): () => void {
    return () => {
      if (isMenuOpen) {
        closeMenu();
      }
      if (isSheetOpen) {
        closeSheet();
      }
    };
  }

  $effect(() => {
    if (isSheetOpen) {
      return takeBackWithinScreen(closeSheet);
    }
    if (isMenuOpen) {
      return takeBackWithinScreen(closeMenu);
    }
    return undefined;
  });
</script>

{#if isWide.current || floats || chrome.isCommandBar}
  <DropdownMenu bind:open={isMenuOpen} {onOpenChange}>
    <DropdownMenuTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          {@attach closesWhenGone}
          look="icon"
          aria-label={m.reader_more()}
          class={button}
        >
          <ReaderIcon
            name="ellipsis"
            fallback={Ellipsis}
            isKit={isOnPhone}
            size={readerIconSize(platform)}
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
        {#each moreActions as action (action.icon)}
          <DropdownMenuItem onSelect={action.act}>
            <action.fallback size={ITEM_ICON_SIZE} aria-hidden="true" />
            {action.label}
          </DropdownMenuItem>
        {/each}
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
    {@attach closesWhenGone}
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
  <Dialog.Root
    open={isSheetOpen}
    onOpenChange={(isNowOpen: boolean) => {
      if (!isNowOpen) {
        closeSheet();
      }
    }}
  >
    <DrawerContent onDismiss={closeSheet} to="main">
      <div class="flex flex-col px-sheet-inline pbs-sheet-gap">
        <DialogTitle class={sheet.heading}>{title}</DialogTitle>
        {#if isOnPhone}
          <p class="text-small text-muted">
            {m.reader_book_at_page({
              title: seriesTitle,
              page: pageNumber,
              count: pageCount,
            })}
          </p>
        {/if}
      </div>
      <div class={sheet.list}>
        {#each moreActions as action (action.icon)}
          <Item look={sheet.row} class={sheet.shape}>
            {#snippet child({ props })}
              <Button
                {...props}
                type="button"
                look="row"
                onclick={() => {
                  closeSheet();
                  action.act();
                }}
              >
                <ReaderIcon
                  name={action.icon}
                  fallback={action.fallback}
                  isKit={isOnPhone}
                  size={READER_ICON_SIZE}
                />
                <ItemTitle class={sheet.title}>{action.label}</ItemTitle>
              </Button>
            {/snippet}
          </Item>
        {/each}
        <hr class={sheet.rule} />
        <Item look={sheet.row} class={[sheet.shape, sheet.wayBack]}>
          {#snippet child({ props })}
            <a {...props} href={resolve("/(app)")}>
              <ReaderIcon
                name="library"
                fallback={Library}
                isKit={isOnPhone}
                size={READER_ICON_SIZE}
              />
              <ItemTitle class={sheet.title}>{m.reader_back_label()}</ItemTitle>
            </a>
          {/snippet}
        </Item>
      </div>
    </DrawerContent>
  </Dialog.Root>
{/if}
