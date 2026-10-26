<script lang="ts">
  import {
    Bookmark,
    ChevronDown,
    Keyboard,
    Maximize,
    SlidersHorizontal,
  } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import type { ResolvedPathname } from "$app/types";
  import { cn } from "#lib/components/cn.ts";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import { isPointer, usesCommandKey } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoon from "#lib/reader/ComingSoon.svelte";

  import {
    READER_CAPSULE,
    READER_GLASS,
    READER_ICON_SIZE,
    readerBackLook,
    readerButton,
  } from "./reader-bar.ts";
  import { getReaderChrome } from "./reader-chrome.svelte.ts";
  import ReaderBackArrow from "./ReaderBackArrow.svelte";
  import ReaderIcon from "./ReaderIcon.svelte";

  let {
    seriesHref,
    platform,
    seriesTitle,
    bookTitle,
    pageNumber,
    pageCount,
    quickSettings,
    more,
    isSettingsOpen,
    areShortcutsOpen,
    onShortcuts,
    bookmark,
    onBookmark,
    isJumpOpen,
    onJump,
    onSettings,
    onFullScreen,
  }: {
    seriesHref: ResolvedPathname;
    platform: Platform;
    seriesTitle: string;
    bookTitle: string;
    pageNumber: number;
    pageCount: number;
    quickSettings: Snippet | undefined;
    more: Snippet;
    isSettingsOpen: boolean;
    areShortcutsOpen: boolean;
    onShortcuts: () => void;
    bookmark: { readonly label: string; readonly isPressed: boolean } | null;
    onBookmark: () => void;
    isJumpOpen: boolean;
    onJump: () => void;
    onSettings: () => void;
    onFullScreen: () => void;
  } = $props();

  const backLabel = $derived(m.reader_back_to_series({ series: seriesTitle }));
  const JUMP_ICON_SIZE = 12;

  const chrome = getReaderChrome();
  const isOnPhone = $derived(chrome.isOnPhone);
  const floats = $derived(chrome.floats);
  const button = $derived(readerButton(platform, chrome.width));
  const jumpLabel = $derived(
    m.reader_jump_from_series_book({
      series: seriesTitle,
      title: bookTitle,
      page: pageNumber,
      count: pageCount,
    }),
  );
</script>

<div
  class={floats
    ? "relative isolate flex items-center gap-sm before:pointer-events-none before:absolute before:-inset-x-reader-bar-inline before:-inset-bs-reader-bar-top before:-inset-be-reader-scrim-fade before:z-behind before:reader-top-scrim before:backdrop-blur-ios"
    : cn(
        READER_GLASS,
        "flex items-center gap-2xs p-icon-gap min-block-reader-top expanded:gap-xs expanded:px-sm expanded:py-none expanded:min-block-reader-top-wide",
      )}
>
  <Tooltip
    label={backLabel}
    keys={isPointer(platform)
      ? [
          m.reader_key_esc(),
          usesCommandKey(platform)
            ? m.reader_key_back_mac()
            : m.reader_key_back(),
        ]
      : []}
  >
    {#snippet child({ props })}
      <a
        {...props}
        href={seriesHref}
        aria-label={backLabel}
        class={cn(
          readerBackLook(platform, chrome.width),
          floats && "text-native-on-top-bar",
          !isOnPhone &&
            "gap-2xs ios:max-inline-reader-back-named ios:max-expanded:shrink ios:max-expanded:ps-xs ios:max-expanded:pe-sm ios:max-expanded:inline-auto ios:max-expanded:min-inline-reader-dense",
        )}
      >
        <ReaderBackArrow {platform} {isOnPhone} />
        {#if !isOnPhone}
          <span
            class="hidden truncate text-small text-accent max-inline-reader-crumb-book ios:max-expanded:inline"
          >
            {seriesTitle}
          </span>
        {/if}
      </a>
    {/snippet}
  </Tooltip>
  {#if floats}
    <button
      type="button"
      aria-label={jumpLabel}
      aria-haspopup="dialog"
      aria-expanded={isJumpOpen}
      aria-keyshortcuts="G"
      class="flex flex-1 flex-col items-center justify-center rounded-full text-center text-native-on-top-bar transition-control min-block-native-target min-inline-none focus-visible:focus-ring active:opacity-50"
      onclick={onJump}
    >
      <span class="truncate text-small font-semibold max-inline-full">
        {seriesTitle}
      </span>
      <span
        class="flex items-center overflow-hidden text-caption font-medium text-muted max-inline-full"
      >
        <span class="truncate">{bookTitle}</span>
        <span class="flex shrink-0 items-center gap-2xs ps-2xs max-inline-full">
          <ChevronDown
            size={JUMP_ICON_SIZE}
            aria-hidden="true"
            class="shrink-0"
          />
          <span class="truncate">
            {m.reader_page_after_book({
              page: m.reader_page_of({ page: pageNumber, count: pageCount }),
            })}
          </span>
        </span>
      </span>
    </button>
  {:else}
    <div
      class="relative isolate flex flex-1 flex-col justify-center px-xs min-block-touch-target min-inline-none expanded:hidden"
    >
      <span
        class="pointer-events-none truncate text-small font-semibold ios:hidden"
      >
        {seriesTitle}
      </span>
      <span class="pointer-events-none truncate text-caption text-muted">
        {m.reader_book_at_page({
          title: bookTitle,
          page: pageNumber,
          count: pageCount,
        })}
        <ChevronDown
          size={JUMP_ICON_SIZE}
          aria-hidden="true"
          class="inline align-middle"
        />
      </span>
      <button
        type="button"
        aria-label={m.reader_jump_to_book()}
        aria-haspopup="dialog"
        aria-expanded={isJumpOpen}
        aria-keyshortcuts="G"
        class="absolute inset-none z-behind rounded-shadcn-control transition-control hover:bg-hover active:bg-pressed"
        onclick={onJump}
      ></button>
    </div>
  {/if}
  <Breadcrumb
    aria-label={m.reader_breadcrumb()}
    class="hidden flex-1 text-small min-inline-none expanded:block"
  >
    <BreadcrumbItem class="min-inline-none">
      <a
        href={seriesHref}
        class="-my-xs block truncate py-xs text-muted transition-control max-inline-reader-crumb-series hover:text-foreground"
        >{seriesTitle}</a
      >
    </BreadcrumbItem>
    <BreadcrumbSeparator class="text-muted" />
    <BreadcrumbItem class="min-inline-none">
      <BreadcrumbPage class="min-inline-none">
        <Tooltip
          label={m.reader_jump_to_book()}
          keys={["G"]}
          type="button"
          aria-label={m.reader_jump_from_book({ title: bookTitle })}
          aria-expanded={isJumpOpen}
          aria-keyshortcuts="G"
          onclick={onJump}
        >
          {#snippet child({ props })}
            <button
              {...props}
              class={cn(
                "flex items-center gap-2xs rounded-shadcn-control px-xs text-foreground transition-control max-inline-full min-block-compact-button min-inline-none hover:bg-hover active:bg-pressed",
                isJumpOpen && "bg-hover",
              )}
            >
              <span class="truncate max-inline-reader-crumb-book"
                >{bookTitle}</span
              >
              <ChevronDown
                size={JUMP_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
            </button>
          {/snippet}
        </Tooltip>
      </BreadcrumbPage>
    </BreadcrumbItem>
  </Breadcrumb>
  {#if quickSettings !== undefined}
    <div
      role="group"
      aria-label={m.reader_quick_settings()}
      class="hidden shrink-0 items-stretch rounded-shadcn-control shadow-raised large:flex"
    >
      {@render quickSettings()}
    </div>
  {/if}
  <span
    aria-hidden="true"
    class="mx-xs hidden shrink-0 border-s border-border block-lg large:block"
  ></span>
  <div
    role={floats ? "group" : undefined}
    aria-label={floats ? m.reader_actions() : undefined}
    class={floats ? READER_CAPSULE : "contents"}
  >
    <Tooltip
      label={m.reader_keyboard_shortcuts()}
      type="button"
      aria-label={m.reader_keyboard_shortcuts()}
      aria-keyshortcuts="?"
      aria-expanded={areShortcutsOpen}
      onclick={onShortcuts}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class={cn(
            button,
            "max-expanded:hidden",
            areShortcutsOpen && "bg-hover",
          )}
        >
          <Keyboard size={READER_ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
    {#if bookmark === null}
      <ComingSoon
        label={m.reader_bookmark()}
        class={cn(button, "text-muted hover:bg-transparent")}
      >
        <ReaderIcon
          name="bookmark"
          fallback={Bookmark}
          isKit={floats}
          size={READER_ICON_SIZE}
        />
      </ComingSoon>
    {:else}
      <Tooltip
        label={bookmark.label}
        type="button"
        aria-label={bookmark.label}
        aria-pressed={bookmark.isPressed}
        onclick={onBookmark}
      >
        {#snippet child({ props })}
          <Button
            {...props}
            look="icon"
            class={cn(button, bookmark.isPressed && !floats && "bg-hover")}
          >
            <ReaderIcon
              name={bookmark.isPressed ? "bookmark-filled" : "bookmark"}
              fallback={Bookmark}
              isKit={floats}
              size={READER_ICON_SIZE}
              isFilled={bookmark.isPressed}
            />
          </Button>
        {/snippet}
      </Tooltip>
    {/if}
    <Tooltip
      label={m.reader_settings()}
      type="button"
      aria-label={m.reader_settings()}
      aria-expanded={isSettingsOpen}
      onclick={onSettings}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class={cn(button, isSettingsOpen && !floats && "bg-hover")}
        >
          <ReaderIcon
            name="sliders-horizontal"
            fallback={SlidersHorizontal}
            isKit={floats}
            size={READER_ICON_SIZE}
          />
        </Button>
      {/snippet}
    </Tooltip>
    <Tooltip
      label={m.reader_full_screen()}
      type="button"
      aria-label={m.reader_full_screen()}
      onclick={onFullScreen}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class={cn(button, "hidden expanded:flex ios:hidden android:hidden")}
        >
          <Maximize size={READER_ICON_SIZE} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
    {@render more()}
  </div>
</div>
