<script lang="ts">
  import { Info, Trash } from "@lucide/svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
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

  function titleOf(folder: LibraryFolder): string {
    const name = folderTitle(folder);
    return books === undefined
      ? m.library_remove_books_title_uncounted({ name })
      : m.library_remove_books_title({ count: books, name });
  }
</script>

<ConfirmDialog
  isOpen={folder !== undefined}
  icon={Trash}
  title={folder === undefined ? "" : titleOf(folder)}
  confirmLabel={m.library_remove_books_confirm()}
  cancelLabel={m.library_remove_books_cancel()}
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
      <Info size={NOTE_ICON_SIZE} aria-hidden="true" class="mbs-2xs shrink-0" />
      <span>{m.library_remove_books_note()}</span>
    </p>
  {/if}
</ConfirmDialog>
