<script lang="ts">
  import { Folder, FolderMinus, ShieldCheck } from "@lucide/svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";

  const DIALOG_ICON_SIZE = 18;
  const NOTE_ICON_SIZE = 16;

  const BUTTON =
    "rounded-full px-lg text-body font-semibold transition-control min-block-touch-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ios:max-medium:rounded-ios-button medium:rounded-button medium:text-label medium:min-block-pointer-target";

  let {
    folder,
    books,
    onConfirm,
    onCancel,
  }: {
    folder: LibraryFolder | undefined;
    books: number | undefined;
    onConfirm: (folder: LibraryFolder) => void;
    onCancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement | undefined = $state();

  $effect(() => {
    if (folder !== undefined && dialog?.open === false) {
      dialog.showModal();
    } else if (folder === undefined && dialog?.open === true) {
      dialog.close();
    }
  });

  function detailOf(folder: LibraryFolder): string {
    return books === undefined
      ? folder.location
      : m.library_remove_folder_detail({ location: folder.location, books });
  }
</script>

<dialog
  bind:this={dialog}
  role="alertdialog"
  aria-labelledby="remove-folder-title"
  aria-describedby="remove-folder-body"
  class="m-auto flex-col gap-lg bg-card px-sheet-inline text-foreground backdrop:bg-scrim open:flex max-medium:mbe-none max-medium:rounded-ss-confirm-sheet max-medium:rounded-se-confirm-sheet max-medium:pbs-sm max-medium:pbe-page-bottom max-medium:inline-full max-medium:max-inline-full medium:rounded-panel medium:border medium:border-dialog-edge medium:py-sheet-inline medium:shadow-dialog medium:inline-dialog"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
>
  {#if folder !== undefined}
    <span
      aria-hidden="true"
      class="self-center rounded-full bg-step-off block-sheet-handle-block inline-sheet-handle medium:hidden"
    ></span>
    <div class="flex items-center gap-md">
      <span
        class="flex shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger block-header-badge inline-header-badge"
      >
        <FolderMinus size={DIALOG_ICON_SIZE} aria-hidden="true" />
      </span>
      <h2
        id="remove-folder-title"
        class="text-dialog-title font-bold max-medium:text-sheet-title"
      >
        {m.library_remove_folder_title()}
      </h2>
    </div>
    <div id="remove-folder-body" class="flex flex-col gap-md">
      <div
        class="flex items-center gap-md rounded-card bg-well px-list-row py-md"
      >
        <span
          class="flex shrink-0 items-center justify-center rounded-control bg-card block-icon-tile inline-icon-tile"
        >
          <Folder size={DIALOG_ICON_SIZE} aria-hidden="true" />
        </span>
        <div class="flex flex-col min-inline-none">
          <p class="truncate text-callout font-semibold max-medium:text-body">
            {folderTitle(folder)}
          </p>
          <p class="text-footnote wrap-break-word text-muted">
            {detailOf(folder)}
          </p>
        </div>
      </div>
      <p
        class="flex items-start gap-sm text-footnote text-muted max-medium:text-label"
      >
        <ShieldCheck
          size={NOTE_ICON_SIZE}
          aria-hidden="true"
          class="mbs-2xs shrink-0 text-accent"
        />
        <span>{m.library_remove_folder_note()}</span>
      </p>
    </div>
    <div
      class="mbs-xs flex flex-col-reverse gap-sheet-buttons medium:grid medium:grid-cols-2 medium:gap-sm"
    >
      <button
        type="button"
        class={[
          BUTTON,
          "bg-chip hover:tint-hover active:tint-pressed medium:border medium:border-border medium:bg-card",
        ]}
        onclick={onCancel}
      >
        {m.library_remove_folder_cancel()}
      </button>
      <button
        type="button"
        class={[
          BUTTON,
          "bg-danger text-on-danger hover:bg-danger-hover active:bg-danger-pressed",
        ]}
        onclick={() => {
          onConfirm(folder);
        }}
      >
        {m.library_remove_folder_confirm()}
      </button>
    </div>
  {/if}
</dialog>
