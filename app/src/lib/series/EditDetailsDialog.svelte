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
  import {
    editDetailsLook,
    PHONE_EDIT_DETAILS_LOOK,
  } from "./edit-details-look.ts";
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

  const wideLook = $derived(editDetailsLook(platform));
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
      isSheet={isGrouped}
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
    wideClass={wideLook.panel}
    wideOverlayClass={wideLook.overlay}
    phoneClass={isIosPhone ? "" : PHONE_EDIT_DETAILS_LOOK.panel}
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
        {@const look = view === "wide" ? wideLook : PHONE_EDIT_DETAILS_LOOK}
        <div class={look.header}>
          <div class="flex items-center gap-md">
            {#if look.hasBadge}
              <HeaderBadge icon={Pencil} look="header-accent" />
            {/if}
            <DialogTitle class={look.title}>
              {m.series_edit_details()}
            </DialogTitle>
          </div>
          <Dialog.Description class={look.subtitle}>
            {m.edit_details_for({ series: shown.current?.title ?? "" })}
          </Dialog.Description>
        </div>
        <div class={look.body}>
          {@render detailFields(false)}
          {@render undoNotice()}
        </div>
        <div class={look.actions}>
          <Button type="button" {...look.cancel} onclick={leave}>
            {m.library_cancel()}
          </Button>
          <Button
            type="button"
            {...look.save}
            disabled={editing === undefined}
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
