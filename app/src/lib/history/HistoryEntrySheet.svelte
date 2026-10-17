<script lang="ts">
  import { Ellipsis, LibraryBig, Play, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { HistoryEntryActions } from "./history-entry-actions.ts";
  import { whereLeft } from "./history-line.ts";

  const ICON_SIZE = 18;
  const ACTION =
    "flex items-center gap-md rounded-control px-sm text-body font-medium transition-control min-block-touch-target hover:bg-hover active:bg-pressed";

  let {
    entry,
    cover,
    actions,
  }: {
    entry: HistoryEntry;
    cover: ShownCover;
    actions: HistoryEntryActions;
  } = $props();

  let isOpen = $state(false);

  function act(action: (one: HistoryEntry) => void): void {
    isOpen = false;
    action(entry);
  }
</script>

<Tooltip
  label={m.history_more_short()}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isOpen}
  aria-label={m.history_more({ book: entry.bookTitle })}
  onclick={() => {
    isOpen = true;
  }}
>
  {#snippet child({ props })}
    <Button
      {...props}
      look="row-action"
      class="me-2xs shrink-0 block-touch-target inline-touch-target before:block-pointer-target before:inline-pointer-target large:hidden"
    >
      <Ellipsis size={ICON_SIZE} aria-hidden="true" />
    </Button>
  {/snippet}
</Tooltip>

<Dialog.Root bind:open={isOpen}>
  <DrawerContent
    onDismiss={() => {
      isOpen = false;
    }}
  >
    <div class="flex items-center gap-md px-sheet-inline pbs-sheet-gap">
      <ListCover
        {cover}
        {coverUrl}
        class="rounded-history-cover inline-history-cover"
      />
      <div class="flex flex-col gap-2xs min-inline-none">
        <DialogTitle class="truncate text-title font-bold">
          {entry.seriesTitle}
        </DialogTitle>
        <p class="truncate text-detail text-muted">
          {m.history_entry_place({
            book: entry.bookTitle,
            where: whereLeft(entry),
          })}
        </p>
      </div>
    </div>
    <div class="flex flex-col px-sm pbs-sm pbe-sheet-bottom">
      <button
        type="button"
        class={ACTION}
        onclick={() => {
          act(actions.continueReading);
        }}
      >
        <Play size={ICON_SIZE} aria-hidden="true" />
        {m.history_continue_reading()}
      </button>
      <button
        type="button"
        class={ACTION}
        onclick={() => {
          act(actions.openSeries);
        }}
      >
        <LibraryBig size={ICON_SIZE} aria-hidden="true" />
        {m.history_open_the_series()}
      </button>
      <button
        type="button"
        class={ACTION}
        onclick={() => {
          act(actions.remove);
        }}
      >
        <X size={ICON_SIZE} aria-hidden="true" />
        {m.history_remove()}
      </button>
    </div>
  </DrawerContent>
</Dialog.Root>
