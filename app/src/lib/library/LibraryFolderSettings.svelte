<script lang="ts">
  import { onMount, tick } from "svelte";

  import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
  import type { Notices } from "#lib/notices/notices.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import EmptiedFolderCard from "./EmptiedFolderCard.svelte";
  import HomeFolder from "./HomeFolder.svelte";
  import {
    type CountFolderBooks,
    LibraryFolders,
    type ListFolders,
    type RemoveFolder,
  } from "./library-folders.svelte";
  import LinkedFolders from "./LinkedFolders.svelte";
  import RemoveBooksDialog from "./RemoveBooksDialog.svelte";
  import RescanButton from "./RescanButton.svelte";
  import type { RescanFolder } from "./rescan-folder";
  import { type RemoveFolderBooks, Rescans } from "./rescans.svelte";
  import RescanStatus from "./RescanStatus.svelte";

  let {
    listFolders,
    removeFolder,
    countFolderBooks,
    addFolder,
    rescanFolder,
    removeFolderBooks,
    notices,
    usesStandIns,
    platform,
  }: {
    listFolders: ListFolders;
    removeFolder: RemoveFolder;
    countFolderBooks: CountFolderBooks;
    addFolder: AddFolder;
    rescanFolder: RescanFolder;
    removeFolderBooks: RemoveFolderBooks;
    notices: Notices;
    usesStandIns: boolean;
    platform: Platform;
  } = $props();

  const folders = new LibraryFolders(
    (after) => listFolders(after),
    (id) => removeFolder(id),
    (id) => countFolderBooks(id),
  );
  const rescans = new Rescans(
    (id, onProgress) => rescanFolder(id, onProgress),
    (id) => removeFolderBooks(id),
  );

  onMount(() => {
    void folders.load();
  });

  let linkedFolders: { focusRow: (folder: LibraryFolder) => void } | undefined =
    $state();
  let askingToRemoveBooks: LibraryFolder | undefined = $state();
  let booksToRemove: number | undefined = $state();
  let booksRemovalAsker: HTMLButtonElement | undefined;
  let latestBooksRemovalAsked = 0;

  /** Apple platforms don't focus a clicked button, so focus goes back to it by hand, or to the folder's row once its warning is gone. */
  async function returnFocus(
    asker: HTMLButtonElement | undefined,
    folder: LibraryFolder,
  ): Promise<void> {
    await tick();
    if (asker?.isConnected === true) {
      asker.focus();
    } else {
      linkedFolders?.focusRow(folder);
    }
  }

  /** Only the latest question opens, and none once the folder's warning was rescanned or another removal or rescan started while the books were counted. */
  async function askToRemoveBooks(
    folder: LibraryFolder,
    asker: HTMLButtonElement,
  ): Promise<void> {
    const asked = ++latestBooksRemovalAsked;
    const books = await folders.countBooks(folder);
    if (asked !== latestBooksRemovalAsked || rescans.isBusy) {
      return;
    }
    booksRemovalAsker = asker;
    booksToRemove = books;
    askingToRemoveBooks = folder;
  }

  async function removeBooks(
    folder: LibraryFolder,
    asker: HTMLButtonElement | undefined,
  ): Promise<void> {
    askingToRemoveBooks = undefined;
    const removed = await rescans.removeBooks(folder);
    await folders.load();
    await returnFocus(asker, folder);
    if (removed !== undefined) {
      notices.tell(m.library_books_removed({ count: removed }));
    }
  }

  async function rescanEmptied(
    folder: LibraryFolder,
    asker: HTMLButtonElement,
  ): Promise<void> {
    latestBooksRemovalAsked += 1;
    await rescans.rescan(folder);
    await folders.load();
    await returnFocus(asker, folder);
  }
</script>

{#snippet rescanButton(folder: LibraryFolder)}
  <RescanButton
    {folder}
    {rescans}
    onFinished={() => {
      void folders.load();
    }}
  />
{/snippet}

<div
  class="mbs-pane-gap flex flex-col gap-pane-gap two-pane:max-inline-section"
>
  <HomeFolder folders={folders.list} {platform} rowAction={rescanButton}>
    <RescanStatus status={rescans.status} kind="home" />
    <p class="mbs-sm px-xs text-caption text-muted">
      {m.library_settings_home_folder_hint()}
    </p>
  </HomeFolder>

  <LinkedFolders
    bind:this={linkedFolders}
    {folders}
    {addFolder}
    {notices}
    {usesStandIns}
    rowAction={rescanButton}
    isFoundEmpty={(folder: LibraryFolder) =>
      rescans.emptied(folder) !== undefined}
  >
    {#snippet rowNotice(folder: LibraryFolder)}
      {@const emptied = rescans.emptied(folder)}
      {#if emptied !== undefined}
        <EmptiedFolderCard
          {folder}
          {emptied}
          isBusy={rescans.isBusy}
          onRescan={(asker: HTMLButtonElement) => {
            void rescanEmptied(folder, asker);
          }}
          onRemove={(asker: HTMLButtonElement) => {
            if (emptied === "removalFailed") {
              void removeBooks(folder, asker);
            } else {
              void askToRemoveBooks(folder, asker);
            }
          }}
        />
      {/if}
    {/snippet}
    {#snippet status()}
      <RescanStatus status={rescans.status} kind="linked" />
    {/snippet}
    {#snippet hint()}
      {m.library_settings_folders_hint()}
    {/snippet}
  </LinkedFolders>
</div>

<RemoveBooksDialog
  folder={askingToRemoveBooks}
  books={booksToRemove}
  onConfirm={(folder: LibraryFolder) => {
    void removeBooks(folder, booksRemovalAsker);
  }}
  onCancel={() => {
    const folder = askingToRemoveBooks;
    askingToRemoveBooks = undefined;
    if (folder !== undefined) {
      void returnFocus(booksRemovalAsker, folder);
    }
  }}
/>
