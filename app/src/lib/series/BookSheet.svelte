<script lang="ts">
  import { Ellipsis, Eye, EyeOff, ListChecks, Play } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { ReadMark, SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { bookActions } from "./book-actions";
  import { readingWords } from "./book-reading";

  const ICON_SIZE = 18;
  const ACTION =
    "gap-md rounded-control px-sm text-body font-medium min-block-touch-target";

  let {
    book,
    onMark,
    onSelect,
  }: {
    book: SeriesBook;
    onMark: (mark: ReadMark) => void;
    onSelect: () => void;
  } = $props();

  const actions = $derived(bookActions(book.reading));
  let isOpen = $state(false);

  function close(): void {
    isOpen = false;
  }
</script>

<Tooltip
  label={m.series_book_more_short()}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={m.series_book_more({ title: book.title })}
  onclick={() => {
    isOpen = true;
  }}
>
  {#snippet child({ props })}
    <Button
      {...props}
      look="row-action"
      class="shrink-0 block-touch-target inline-touch-target before:block-pointer-target before:inline-pointer-target"
    >
      <Ellipsis size={ICON_SIZE} aria-hidden="true" />
    </Button>
  {/snippet}
</Tooltip>

<Dialog.Root bind:open={isOpen}>
  <DrawerContent onDismiss={close}>
    <div class="flex flex-col gap-2xs px-sheet-inline pbs-sheet-gap">
      <DialogTitle class="text-title font-bold">{book.title}</DialogTitle>
      <p class="text-detail text-muted">
        {readingWords(book.reading, m.series_book_unread)}
      </p>
    </div>
    <div class="flex flex-col px-sm pbs-sm pbe-sheet-bottom">
      <a
        href={resolve("/read/[book]", { book: book.id })}
        class={["flex items-center hover:bg-hover", ACTION]}
      >
        <Play size={ICON_SIZE} aria-hidden="true" />
        {actions.read === "continue"
          ? m.series_continue_reading()
          : m.series_start_reading()}
      </a>
      <Button
        type="button"
        look="row"
        class={ACTION}
        onclick={() => {
          close();
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
      </Button>
      <Button
        type="button"
        look="row"
        class={ACTION}
        onclick={() => {
          close();
          onSelect();
        }}
      >
        <ListChecks size={ICON_SIZE} aria-hidden="true" />
        {m.series_select()}
      </Button>
    </div>
  </DrawerContent>
</Dialog.Root>
