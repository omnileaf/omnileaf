<script lang="ts">
  import {
    ArrowLeft,
    Bookmark,
    ChevronLeft,
    Keyboard,
    Maximize,
  } from "@lucide/svelte";
  import type { Snippet } from "svelte";

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

  const BACK_ICON_SIZE = 24;
  const BACK_ICON_SIZE_WIDE = 20;
  const BAR_ICON_SIZE_WIDE = 19;
  const BAR_ICON_SIZE = 20;
  const UPCOMING_TOOL_LOOK =
    "relative flex shrink-0 items-center justify-center rounded-full block-reader-control inline-reader-control expanded:rounded-reader-control-wide expanded:block-reader-control-wide expanded:inline-reader-control-wide android:before:absolute android:before:block-touch-target android:before:inline-touch-target";

  let {
    seriesHref,
    seriesTitle,
    bookTitle,
    quickSettings,
    onFullScreen,
  }: {
    seriesHref: string;
    seriesTitle: string;
    bookTitle: string;
    quickSettings: Snippet;
    onFullScreen: () => void;
  } = $props();

  const backLabel = $derived(m.reader_back_to_series({ series: seriesTitle }));
</script>

<div
  class="flex items-center gap-2xs rounded-reader-bar border border-reader-glass-edge bg-reader-glass p-xs shadow-reader-bar backdrop-blur-reader backdrop-saturate-140 expanded:gap-xs expanded:rounded-reader-bar-wide expanded:bg-reader-glass-wide expanded:px-reader-bar-inline-wide expanded:py-reader-bar-block-wide expanded:shadow-reader-bar-wide"
>
  <Tooltip label={backLabel}>
    {#snippet child({ props })}
      <a
        {...props}
        href={seriesHref}
        aria-label={backLabel}
        class="relative flex shrink-0 items-center justify-center gap-xs rounded-full bg-reader-hover transition-control block-reader-control inline-reader-control hover:tint-reader-hover active:tint-reader-pressed expanded:rounded-reader-control-wide expanded:ps-reader-back-start-wide expanded:pe-md expanded:text-small expanded:font-semibold expanded:block-reader-control-wide expanded:inline-auto expanded:max-inline-reader-book-step android:before:absolute android:before:block-touch-target android:before:inline-touch-target"
      >
        <ArrowLeft
          size={BACK_ICON_SIZE}
          aria-hidden="true"
          class="hidden android:max-expanded:block"
        />
        <ChevronLeft
          size={BACK_ICON_SIZE}
          aria-hidden="true"
          class="expanded:hidden rtl:-scale-x-100 android:max-expanded:hidden"
        />
        <ChevronLeft
          size={BACK_ICON_SIZE_WIDE}
          aria-hidden="true"
          class="hidden shrink-0 expanded:block rtl:-scale-x-100"
        />
        <span class="truncate max-expanded:hidden">{seriesTitle}</span>
      </a>
    {/snippet}
  </Tooltip>
  <a
    href={seriesHref}
    class="flex flex-1 flex-col px-xs min-inline-none expanded:hidden"
  >
    <span class="truncate text-caption font-semibold text-reader-muted"
      >{seriesTitle}</span
    >
    <span class="truncate text-lead font-semibold">{bookTitle}</span>
  </a>
  <Breadcrumb
    aria-label={m.reader_breadcrumb()}
    class="hidden flex-1 ps-reader-title-start-wide text-small expanded:block"
  >
    <BreadcrumbItem>
      <a
        href={seriesHref}
        class="truncate text-reader-muted transition-control hover:text-on-reader"
        >{seriesTitle}</a
      >
    </BreadcrumbItem>
    <BreadcrumbSeparator class="text-reader-muted" />
    <BreadcrumbItem>
      <BreadcrumbPage class="font-semibold">{bookTitle}</BreadcrumbPage>
    </BreadcrumbItem>
  </Breadcrumb>
  <div
    role="group"
    aria-label={m.reader_quick_settings()}
    class="hidden shrink-0 items-center gap-2xs rounded-reader-control-wide bg-reader-hover p-2xs expanded:flex"
  >
    {@render quickSettings()}
  </div>
  <span
    aria-hidden="true"
    class="hidden shrink-0 bg-reader-line block-reader-divider inline-px expanded:block"
  ></span>
  <ComingSoon label={m.reader_keyboard_shortcuts()} class={UPCOMING_TOOL_LOOK}>
    <Keyboard size={BAR_ICON_SIZE} aria-hidden="true" />
  </ComingSoon>
  <ComingSoon label={m.reader_bookmark()} class={UPCOMING_TOOL_LOOK}>
    <Bookmark size={BAR_ICON_SIZE} aria-hidden="true" />
  </ComingSoon>
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
        class="hidden shrink-0 rounded-reader-control-wide transition-control block-reader-control-wide inline-reader-control-wide hover:tint-reader-hover active:tint-reader-pressed expanded:flex ios:hidden android:hidden"
      >
        <Maximize size={BAR_ICON_SIZE_WIDE} aria-hidden="true" />
      </Button>
    {/snippet}
  </Tooltip>
</div>
