<script lang="ts">
  import { FolderMinus, ShieldCheck } from "@lucide/svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import FolderWell from "./FolderWell.svelte";

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
    <FolderWell {folder} {books} />
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
