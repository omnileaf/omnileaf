<script lang="ts">
  import { Dialog } from "bits-ui";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import type { BooksShown, SortDirection } from "#lib/ipc/bindings.ts";
  import {
    ANDROID_FILTER_HEADING,
    ANDROID_FILTER_SHEET,
  } from "#lib/library/filter-sheet-look.ts";
  import FilterSetting from "#lib/library/FilterSetting.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import {
    type BooksOrder,
    DIRECTIONS,
    EVERY_BOOK_IN_ORDER,
    ORDER_LABELS,
    SHOWN_LABELS,
    SHOWN_OPTIONS,
  } from "#lib/series/book-listing.ts";

  let {
    listing,
    isOpen,
    onChoose,
    onClose,
  }: {
    listing: BooksOrder;
    isOpen: boolean;
    onChoose: (listing: BooksOrder) => void;
    onClose: () => void;
  } = $props();
</script>

<Dialog.Root
  bind:open={
    () => isOpen,
    (isNowOpen: boolean) => {
      if (!isNowOpen) {
        onClose();
      }
    }
  }
>
  <ModalContent phoneClass="max-block-dialog-limit" onDismiss={onClose}>
    <div class={ANDROID_FILTER_SHEET.header}>
      <DialogTitle class={ANDROID_FILTER_SHEET.title}>
        {m.library_filter_and_sort()}
      </DialogTitle>
      <Button
        type="button"
        variant="plain"
        onclick={() => {
          onChoose(EVERY_BOOK_IN_ORDER);
        }}
      >
        {m.library_reset()}
      </Button>
    </div>
    <Dialog.Description class="{ROW_SUBTITLE_TYPE} ps-lg pe-lg text-muted">
      {m.series_sort_and_filter_lead()}
    </Dialog.Description>
    <div class={ANDROID_FILTER_SHEET.body}>
      <h3 class={ANDROID_FILTER_HEADING}>{m.library_sort()}</h3>
      <FilterSetting
        label={m.library_sort_order()}
        options={DIRECTIONS}
        labels={ORDER_LABELS}
        chosen={listing.direction}
        onChoose={(direction: SortDirection) => {
          onChoose({ ...listing, direction });
        }}
      />
      <h3 class={ANDROID_FILTER_HEADING}>{m.library_filter()}</h3>
      <FilterSetting
        label={m.series_show()}
        options={SHOWN_OPTIONS}
        labels={SHOWN_LABELS}
        chosen={listing.shown}
        onChoose={(shown: BooksShown) => {
          onChoose({ ...listing, shown });
        }}
      />
      <p class="{ROW_SUBTITLE_TYPE} ps-lg pe-xl pbs-sm text-muted">
        {m.series_gaps_with_all_only()}
      </p>
    </div>
  </ModalContent>
</Dialog.Root>
