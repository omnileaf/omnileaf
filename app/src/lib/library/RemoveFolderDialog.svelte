<script lang="ts">
  import { Folder, FolderMinus, ShieldCheck } from "@lucide/svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";

  const FOLDER_ICON_SIZE = 18;
  const NOTE_ICON_SIZE = 16;

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

  function detailOf(folder: LibraryFolder): string {
    return books === undefined
      ? folder.location
      : m.library_remove_folder_detail({ location: folder.location, books });
  }
</script>

<ConfirmDialog
  isOpen={folder !== undefined}
  icon={FolderMinus}
  title={m.library_remove_folder_title()}
  confirmLabel={m.library_remove_folder_confirm()}
  cancelLabel={m.library_remove_folder_cancel()}
  onConfirm={() => {
    if (folder !== undefined) {
      onConfirm(folder);
    }
  }}
  {onCancel}
>
  {#if folder !== undefined}
    <div
      class="flex items-center gap-md rounded-card bg-well px-list-row py-md"
    >
      <span
        class="flex shrink-0 items-center justify-center rounded-control bg-card block-icon-tile inline-icon-tile"
      >
        <Folder size={FOLDER_ICON_SIZE} aria-hidden="true" />
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
  {/if}
</ConfirmDialog>
