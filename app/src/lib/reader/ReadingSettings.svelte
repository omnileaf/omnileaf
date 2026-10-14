<script lang="ts">
  import { SlidersHorizontal, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { DrawerContent } from "#lib/components/ui/drawer/index.ts";
  import { EXPANDED_QUERY } from "#lib/page/breakpoints.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    READER_BUTTON,
    READER_GLASS,
    READER_ICON_SIZE,
  } from "./reader-bar.ts";
  import type { ReaderSettings } from "./reader-settings.svelte.ts";
  import ReadingSettingsContent from "./ReadingSettingsContent.svelte";
  import type { SeriesReadingDirection } from "./reading-direction.svelte.ts";

  let {
    isOpen,
    settings,
    reading,
    seriesTitle,
    onClose,
  }: {
    isOpen: boolean;
    settings: ReaderSettings;
    reading: SeriesReadingDirection;
    seriesTitle: string;
    onClose: () => void;
  } = $props();

  const isWide = new MediaQuery(EXPANDED_QUERY);
  const titleId = $props.id();
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
      <div
        class="flex items-center gap-sm border-be border-border px-lg min-block-reader-top-wide"
      >
        <SlidersHorizontal size={READER_ICON_SIZE} aria-hidden="true" />
        <h2 id={titleId} class="flex-1 text-body font-semibold">
          {m.reader_settings()}
        </h2>
        <Button
          type="button"
          look="icon"
          aria-label={m.reader_settings_close()}
          class={READER_BUTTON}
          onclick={onClose}
        >
          <X size={READER_ICON_SIZE} aria-hidden="true" />
        </Button>
      </div>
      <div class="flex-1 overflow-y-auto p-lg">
        <ReadingSettingsContent {settings} {reading} {seriesTitle} />
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
          class="flex items-center justify-center rounded-shadcn-control bg-chip block-reader-dense inline-reader-dense"
        >
          <SlidersHorizontal size={READER_ICON_SIZE} aria-hidden="true" />
        </span>
        <DialogTitle class="flex-1 text-body font-semibold">
          {m.reader_settings()}
        </DialogTitle>
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
        <ReadingSettingsContent {settings} {reading} {seriesTitle} />
      </div>
    </DrawerContent>
  </Dialog.Root>
{/if}
