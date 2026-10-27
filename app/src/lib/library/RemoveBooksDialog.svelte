<script lang="ts">
  import { Info, Trash } from "@lucide/svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import ConfirmDialog from "#lib/page/ConfirmDialog.svelte";
  import { lastShown } from "#lib/page/last-shown.svelte.ts";
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

  const shown = lastShown(() => folder);
</script>

<ConfirmDialog
  isOpen={folder !== undefined}
  icon={Trash}
  title={m.library_remove_books_title()}
  confirmLabel={books === undefined
    ? m.library_remove_books_confirm_uncounted()
    : m.library_remove_books_confirm({ count: books })}
  cancelLabel={m.library_remove_books_cancel()}
  onConfirm={() => {
    if (folder !== undefined) {
      onConfirm(folder);
    }
  }}
  {onCancel}
>
  {#if shown.current !== undefined}
    <FolderWell
      title={folderTitle(shown.current)}
      detail={books === undefined
        ? shown.current.location
        : m.library_remove_books_detail({
            location: shown.current.location,
            books,
          })}
    />
    <p
      class="flex items-start gap-sm text-footnote text-muted max-medium:text-label"
    >
      <Info size={NOTE_ICON_SIZE} aria-hidden="true" class="mbs-2xs shrink-0" />
      <span>{m.library_remove_books_note()}</span>
    </p>
  {/if}
</ConfirmDialog>
