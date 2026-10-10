<script lang="ts">
  import { onMount, tick } from "svelte";

  import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
  import { focusPageHeading } from "#lib/navigation/page-heading.ts";
  import type { Notices } from "#lib/notices/notices.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import HomeFolder from "./HomeFolder.svelte";
  import {
    type CountFolderBooks,
    LibraryFolders,
    type ListFolders,
    type RemoveFolder,
  } from "./library-folders.svelte";
  import LinkedFolders from "./LinkedFolders.svelte";
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

  async function removeBooks(folder: LibraryFolder): Promise<void> {
    const removed = await rescans.removeBooks(folder);
    void folders.load();
    await tick();
    if (document.activeElement === document.body) {
      focusPageHeading();
    }
    if (removed === undefined) {
      return;
    }
    notices.tell(m.library_books_removed({ count: removed }));
  }

  function startRemovingBooks(folder: LibraryFolder): void {
    void removeBooks(folder);
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
    <RescanStatus
      status={rescans.status}
      kind="home"
      onRemoveBooks={startRemovingBooks}
    />
    <p class="mbs-sm px-xs text-caption text-muted">
      {m.library_settings_home_folder_hint()}
    </p>
  </HomeFolder>

  <LinkedFolders
    {folders}
    {addFolder}
    {notices}
    {usesStandIns}
    rowAction={rescanButton}
  >
    {#snippet status()}
      <RescanStatus
        status={rescans.status}
        kind="linked"
        onRemoveBooks={startRemovingBooks}
      />
    {/snippet}
    {#snippet hint()}
      {m.library_settings_folders_hint()}
    {/snippet}
  </LinkedFolders>
</div>
