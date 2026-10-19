<script lang="ts">
  import {
    Bookmark,
    ChevronDown,
    ChevronLeft,
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
    READER_BUTTON,
    READER_GLASS,
    READER_ICON_SIZE,
  } from "./reader-bar.ts";

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
  const UPCOMING = cn(READER_BUTTON, "text-muted hover:bg-transparent");
  const JUMP_ICON_SIZE = 12;
</script>

<div
  class={cn(
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
          READER_BUTTON,
          "gap-2xs ios:max-inline-reader-back-named ios:max-expanded:shrink ios:max-expanded:ps-xs ios:max-expanded:pe-sm ios:max-expanded:inline-auto ios:max-expanded:min-inline-reader-dense",
        )}
      >
        <ChevronLeft
          size={READER_ICON_SIZE}
          aria-hidden="true"
          class="shrink-0 rtl:-scale-x-100"
        />
        <span
          class="hidden truncate text-small text-accent max-inline-reader-crumb-book ios:max-expanded:inline"
        >
          {seriesTitle}
        </span>
      </a>
    {/snippet}
  </Tooltip>
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
      aria-expanded={isJumpOpen}
      aria-keyshortcuts="G"
      class="absolute inset-none z-behind rounded-shadcn-control transition-control hover:bg-hover active:bg-pressed"
      onclick={onJump}
    ></button>
  </div>
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
          aria-label={m.reader_jump_to_book()}
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
          READER_BUTTON,
          "max-expanded:hidden",
          areShortcutsOpen && "bg-hover",
        )}
      >
        <Keyboard size={READER_ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
  {#if bookmark === null}
    <ComingSoon label={m.reader_bookmark()} class={UPCOMING}>
      <Bookmark size={READER_ICON_SIZE} aria-hidden="true" />
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
          class={cn(READER_BUTTON, bookmark.isPressed && "bg-hover")}
        >
          <Bookmark
            size={READER_ICON_SIZE}
            fill={bookmark.isPressed ? "currentColor" : "none"}
            aria-hidden="true"
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
        class={cn(READER_BUTTON, isSettingsOpen && "bg-hover")}
      >
        <SlidersHorizontal size={READER_ICON_SIZE} aria-hidden="true" />
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
        class={cn(
          READER_BUTTON,
          "hidden expanded:flex ios:hidden android:hidden",
        )}
      >
        <Maximize size={READER_ICON_SIZE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
  {@render more()}
</div>
