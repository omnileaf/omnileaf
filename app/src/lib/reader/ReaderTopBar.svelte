<script lang="ts">
  import {
    Bookmark,
    ChevronLeft,
    Keyboard,
    Maximize,
    SlidersHorizontal,
  } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoon from "#lib/reader/ComingSoon.svelte";

  import {
    READER_BUTTON,
    READER_GLASS,
    READER_ICON_SIZE,
  } from "./reader-bar.ts";

  let {
    seriesHref,
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
    onSettings,
    onFullScreen,
  }: {
    seriesHref: string;
    seriesTitle: string;
    bookTitle: string;
    pageNumber: number;
    pageCount: number;
    quickSettings: Snippet;
    more: Snippet;
    isSettingsOpen: boolean;
    areShortcutsOpen: boolean;
    onShortcuts: () => void;
    bookmark: { readonly label: string; readonly isPressed: boolean } | null;
    onBookmark: () => void;
    onSettings: () => void;
    onFullScreen: () => void;
  } = $props();

  const backLabel = $derived(m.reader_back_to_series({ series: seriesTitle }));
  const UPCOMING = cn(READER_BUTTON, "text-muted hover:bg-transparent");
</script>

<div
  class={cn(
    READER_GLASS,
    "flex items-center gap-2xs p-icon-gap min-block-reader-top expanded:gap-xs expanded:px-sm expanded:py-none expanded:min-block-reader-top-wide",
  )}
>
  <Tooltip label={backLabel}>
    {#snippet child({ props })}
      <a
        {...props}
        href={seriesHref}
        aria-label={backLabel}
        class={cn(
          READER_BUTTON,
          "gap-2xs ios:shrink ios:ps-xs ios:pe-sm ios:inline-auto ios:min-inline-reader-dense",
        )}
      >
        <ChevronLeft
          size={READER_ICON_SIZE}
          aria-hidden="true"
          class="shrink-0 rtl:-scale-x-100"
        />
        <span
          class="hidden truncate text-small text-accent max-inline-reader-crumb-book ios:inline"
        >
          {seriesTitle}
        </span>
      </a>
    {/snippet}
  </Tooltip>
  <a
    href={seriesHref}
    class="flex flex-1 flex-col px-xs min-inline-none expanded:hidden"
  >
    <span class="truncate text-small font-semibold ios:hidden">
      {seriesTitle}
    </span>
    <span class="truncate text-caption text-muted">
      {m.reader_book_at_page({
        title: bookTitle,
        page: pageNumber,
        count: pageCount,
      })}
    </span>
  </a>
  <Breadcrumb
    aria-label={m.reader_breadcrumb()}
    class="hidden flex-1 text-small min-inline-none expanded:block"
  >
    <BreadcrumbItem class="min-inline-none">
      <a
        href={seriesHref}
        class="block truncate text-muted transition-control max-inline-reader-crumb-series hover:text-foreground"
        >{seriesTitle}</a
      >
    </BreadcrumbItem>
    <BreadcrumbSeparator class="text-muted" />
    <BreadcrumbItem class="min-inline-none">
      <BreadcrumbPage
        class="block truncate text-foreground max-inline-reader-crumb-book"
      >
        {bookTitle}
      </BreadcrumbPage>
    </BreadcrumbItem>
  </Breadcrumb>
  <div
    role="group"
    aria-label={m.reader_quick_settings()}
    class="hidden shrink-0 items-stretch rounded-shadcn-control shadow-raised expanded:flex"
  >
    {@render quickSettings()}
  </div>
  <span
    aria-hidden="true"
    class="mx-xs hidden shrink-0 border-s border-border block-lg expanded:block"
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
