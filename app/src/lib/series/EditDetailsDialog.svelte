<script lang="ts">
  import { Pencil } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { type Snippet, untrack } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { SheetBar } from "#lib/components/ui/drawer/index.ts";
  import { ModalContent } from "#lib/components/ui/modal/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import { GROUPED_FOOTNOTE_TYPE } from "#lib/library/group-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
  import { phoneOf } from "#lib/page/platform.ts";
  import { getNotices, type UndoOffer } from "#lib/notices/notices.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { changesBetween, type DetailDraft } from "./detail-edits.ts";
  import {
    type DetailsBeingEdited,
    detailsToEdit,
    saveDetails,
  } from "./details-to-edit.ts";
  import DetailUndoToast from "./DetailUndoToast.svelte";
  import DiscardDetailsDialog from "./DiscardDetailsDialog.svelte";
  import EditDetailsFields from "./EditDetailsFields.svelte";
  import type { EditedSeries } from "./edited-series.ts";

  let {
    series,
    platform,
    coverUrl,
    onClose,
    onSaved,
    onError,
  }: {
    series: EditedSeries | undefined;
    platform: Platform;
    coverUrl: CoverUrl;
    onClose: () => void;
    onSaved: () => void;
    onError: (error: unknown) => void;
  } = $props();

  const shown = lastShown(() => series);
  const notices = getNotices();
  const width = new WindowWidth();
  const isIosPhone = $derived(phoneOf(platform, width.current) === "ios");
  const detailFields: Snippet<[boolean]> = fields;
  const undoNotice: Snippet = undoToast;
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
    if (await saveDetails(series.id, editing, notices)) {
      onSaved();
    }
  }
</script>

{#snippet fields(isGrouped: boolean)}
  {#if editing !== undefined}
    <EditDetailsFields
      details={editing.details}
      countsAgeRatings={editing.countsAgeRatings}
      draft={editing.draft}
      {isGrouped}
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
{/snippet}

{#snippet undoToast()}
  <DetailUndoToast
    offer={undoOffer}
    onDone={() => {
      undoOffer = undefined;
    }}
  />
{/snippet}

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
    phoneHeight={isIosPhone ? "large" : "fit"}
    phoneGround={isIosPhone ? "grouped" : "plain"}
    wideClass="inset-none m-auto flex flex-col overflow-hidden rounded-panel border border-dialog-edge bg-card text-foreground fade-motion shadow-dialog block-fit inline-edit-dialog max-block-edit-dialog-height max-inline-dialog-limit"
    phoneClass={isIosPhone ? "" : "inset-bs-sheet-top block-auto"}
    onDismiss={leave}
  >
    {#snippet children(view)}
      {#if isIosPhone}
        <SheetBar
          title={m.series_edit_details()}
          closeLabel={m.edit_details_close()}
          actionLabel={m.edit_details_save()}
          isActionPrimary
          isActionDisabled={editing === undefined}
          onClose={leave}
          onAction={() => {
            void save();
          }}
        />
        <div
          class="flex-1 overflow-y-auto px-lg pbs-sm pbe-sheet-bottom min-block-none"
        >
          <div class="flex flex-col gap-xl">
            <Dialog.Description class={["ps-lg", GROUPED_FOOTNOTE_TYPE]}>
              <span class="sr-only">{shown.current?.title ?? ""}. </span>
              {m.edit_details_intro()}
            </Dialog.Description>
            {@render detailFields(true)}
          </div>
          {@render undoNotice()}
        </div>
      {:else}
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
          {@render detailFields(false)}
          {@render undoNotice()}
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
      {/if}
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
