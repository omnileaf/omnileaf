<script lang="ts">
  import { List, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import type { OpenedBook, SeriesBook } from "#lib/ipc/bindings.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { everyBookIn } from "./every-book.ts";
  import JumpToBookList from "./JumpToBookList.svelte";
  import {
    READER_BUTTON,
    READER_GLASS,
    READER_ICON_SIZE,
  } from "./reader-bar.ts";

  let {
    isOpen,
    book,
    seriesTitle,
    currentPage,
    onClose,
  }: {
    isOpen: boolean;
    book: OpenedBook;
    seriesTitle: string;
    currentPage: number;
    onClose: () => void;
  } = $props();

  const isWide = new MediaQuery(EXPANDED_QUERY);
  const titleId = $props.id();
  let books: SeriesBook[] | undefined = $state();
  let isAsked = false;

  const subtitle = $derived(
    books === undefined
      ? seriesTitle
      : m.reader_jump_subtitle({ series: seriesTitle, count: books.length }),
  );

  $effect(() => {
    if (isOpen && !isAsked) {
      isAsked = true;
      void everyBookIn(book.series).then((found) => {
        books = found ?? [];
      });
    }
  });
</script>

{#if isWide.current}
  {#if isOpen}
    <aside
      aria-labelledby={titleId}
      class={cn(
        READER_GLASS,
        "absolute inset-e-reader-edge inset-bs-reader-settings-top inset-be-reader-edge flex flex-col inline-reader-settings",
      )}
    >
      <div class="flex items-center gap-sm px-lg pbs-md pbe-sm">
        <span
          class="flex shrink-0 items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
        >
          <List size={READER_ICON_SIZE} aria-hidden="true" />
        </span>
        <div class="flex flex-1 flex-col min-inline-none">
          <h2 id={titleId} class="text-body font-semibold">
            {m.reader_jump_to_book()}
          </h2>
          <p class="truncate text-small text-muted expanded:text-caption">
            {subtitle}
          </p>
        </div>
        <Button
          type="button"
          look="icon"
          aria-label={m.reader_jump_close()}
          class={READER_BUTTON}
          onclick={onClose}
        >
          <X size={READER_ICON_SIZE} aria-hidden="true" />
        </Button>
      </div>
      <div class="flex-1 overflow-y-auto px-lg pbe-lg">
        <JumpToBookList {books} current={book.id} {currentPage} {onClose} />
      </div>
    </aside>
  {/if}
{:else}
  <Dialog.Root
    open={isOpen}
    onOpenChange={(open: boolean) => {
      if (!open) {
        onClose();
      }
    }}
  >
    <DrawerContent to="main" onDismiss={onClose} class="max-block-reader-sheet">
      <div class="flex items-center gap-sm px-sheet-inline pbs-sheet-gap">
        <span
          class="flex shrink-0 items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
        >
          <List size={READER_ICON_SIZE} aria-hidden="true" />
        </span>
        <div class="flex flex-1 flex-col min-inline-none">
          <DialogTitle class="text-body font-semibold">
            {m.reader_jump_to_book()}
          </DialogTitle>
          <p class="truncate text-small text-muted expanded:text-caption">
            {subtitle}
          </p>
        </div>
        <Button
          type="button"
          look="bar-icon"
          class="px-md font-medium min-block-touch-target"
          onclick={onClose}
        >
          {m.reader_settings_done()}
        </Button>
      </div>
      <div class="overflow-y-auto px-sheet-inline pbs-md pbe-sheet-bottom">
        <JumpToBookList {books} current={book.id} {currentPage} {onClose} />
      </div>
    </DrawerContent>
  </Dialog.Root>
{/if}
