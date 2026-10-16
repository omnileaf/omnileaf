<script lang="ts">
  import { Pencil } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { untrack } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import type { UndoOffer } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { changesBetween, type DetailDraft, editsOf } from "./detail-edits.ts";
  import { type DetailsBeingEdited, detailsToEdit } from "./details-to-edit.ts";
  import DetailUndoToast from "./DetailUndoToast.svelte";
  import DiscardDetailsDialog from "./DiscardDetailsDialog.svelte";
  import EditDetailsFields from "./EditDetailsFields.svelte";
  import type { EditedSeries } from "./edited-series.ts";

  let {
    series,
    coverUrl,
    onClose,
    onSaved,
    onError,
  }: {
    series: EditedSeries | undefined;
    coverUrl: CoverUrl;
    onClose: () => void;
    onSaved: () => void;
    onError: (error: unknown) => void;
  } = $props();

  const shown = lastShown(() => series);
  let editing = $state<DetailsBeingEdited | undefined>();
  let isAsking = $state(false);
  let undoOffer = $state<UndoOffer | undefined>();

  const changed = $derived(
    editing === undefined ? [] : changesBetween(editing.opened, editing.draft),
  );

  $effect(() => {
    const id = series?.id;
    untrack(() => {
      editing = undefined;
      isAsking = false;
      undoOffer = undefined;
      if (id !== undefined) {
        void load(id);
      }
    });
  });

  async function load(id: EditedSeries["id"]): Promise<void> {
    const read = await detailsToEdit(id);
    if (series?.id !== id) {
      return;
    }
    if (read.kind === "failed") {
      onError(read.error);
      onClose();
      return;
    }
    editing = read.editing;
  }

  function leave(): void {
    if (changed.length > 0) {
      isAsking = true;
    } else {
      onClose();
    }
  }

  async function save(): Promise<void> {
    if (series === undefined || editing === undefined) {
      return;
    }
    const saved = await commands.editSeriesDetails(
      series.id,
      editsOf(editing.details, editing.draft),
    );
    if (saved.status !== "ok") {
      onError(saved.error);
      return;
    }
    onSaved();
  }
</script>

<Dialog.Root
  bind:open={
    () => series !== undefined,
    (isOpen: boolean) => {
      if (!isOpen) {
        leave();
      }
    }
  }
>
  <ModalContent
    wideClass="inset-none m-auto flex flex-col overflow-hidden rounded-panel border border-dialog-edge bg-card text-foreground fade-motion shadow-dialog block-fit inline-edit-dialog max-block-edit-dialog-height max-inline-dialog-limit"
    phoneClass="inset-bs-sheet-top block-auto"
    onDismiss={leave}
  >
    {#snippet children(view)}
      <div
        class={[
          "flex flex-col gap-2xs",
          view === "wide" ? "px-xl pbs-xl pbe-md" : "px-sheet-inline pbs-md",
        ]}
      >
        <div class="flex items-center gap-md">
          <HeaderBadge icon={Pencil} look="header-accent" />
          <DialogTitle class="text-title font-bold">
            {m.series_edit_details()}
          </DialogTitle>
        </div>
        <Dialog.Description class="text-label text-muted">
          {m.edit_details_for({ series: shown.current?.title ?? "" })}
        </Dialog.Description>
      </div>
      <div
        class={[
          "flex-1 overflow-y-auto min-block-none",
          view === "wide" ? "px-xl" : "px-sheet-inline",
        ]}
      >
        {#if editing !== undefined}
          <EditDetailsFields
            details={editing.details}
            draft={editing.draft}
            onDraft={(draft: DetailDraft) => {
              if (editing !== undefined) {
                editing.draft = draft;
              }
            }}
            offerUndo={(offer: UndoOffer) => {
              undoOffer = offer;
            }}
          />
        {/if}
        <DetailUndoToast
          offer={undoOffer}
          onDone={() => {
            undoOffer = undefined;
          }}
        />
      </div>
      <div
        class={[
          "flex justify-end gap-sm",
          view === "wide"
            ? "px-xl pbs-md pbe-xl"
            : "border-bs border-border px-sheet-inline pbs-md pbe-sheet-bottom",
        ]}
      >
        <Button
          type="button"
          look="outline"
          class="rounded-control px-lg font-medium min-block-pointer-button touch:min-block-touch-target"
          onclick={leave}
        >
          {m.library_cancel()}
        </Button>
        <Button
          type="button"
          look="filled"
          disabled={editing === undefined}
          class="rounded-control px-lg font-semibold min-block-pointer-button touch:min-block-touch-target"
          onclick={() => {
            void save();
          }}
        >
          {m.edit_details_save()}
        </Button>
      </div>
    {/snippet}
  </ModalContent>
</Dialog.Root>
{#if shown.current !== undefined}
  <DiscardDetailsDialog
    isOpen={isAsking}
    series={shown.current}
    {changed}
    {coverUrl}
    onDiscard={() => {
      isAsking = false;
      onClose();
    }}
    onKeepEditing={() => {
      isAsking = false;
    }}
  />
{/if}
