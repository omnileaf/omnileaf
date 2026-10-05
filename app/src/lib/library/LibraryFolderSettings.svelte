<script lang="ts">
  import { onMount } from "svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import type { Notices } from "$lib/notices/notices.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import AddFolderButton from "./AddFolderButton.svelte";
  import { FolderAdding } from "./folder-adding.svelte";
  import FolderNotice from "./FolderNotice.svelte";
  import FolderRow from "./FolderRow.svelte";
  import {
    LibraryFolders,
    type ListFolders,
    type RemoveFolder,
  } from "./library-folders.svelte";
  import RemoveFolderDialog from "./RemoveFolderDialog.svelte";

  let {
    listFolders,
    removeFolder,
    addFolder,
    notices,
    usesStandIns,
  }: {
    listFolders: ListFolders;
    removeFolder: RemoveFolder;
    addFolder: AddFolder;
    notices: Notices;
    usesStandIns: boolean;
  } = $props();

  const folders = new LibraryFolders(
    (after) => listFolders(after),
    (id) => removeFolder(id),
  );

  const adding = new FolderAdding(
    (onProgress) => addFolder(onProgress),
    () => notices,
    () => {
      void folders.load();
    },
  );

  let addButton: HTMLButtonElement | undefined = $state();
  let confirming: LibraryFolder | undefined = $state();
  let notRemoved: LibraryFolder | undefined = $state();
  let foldersHeading: HTMLHeadingElement | undefined = $state();

  onMount(() => {
    void folders.load();
  });

  async function remove(folder: LibraryFolder): Promise<void> {
    confirming = undefined;
    const outcome = await folders.remove(folder);
    notRemoved = outcome === "failed" ? folder : undefined;
    if (outcome === "removed") {
      adding.dismiss();
    }
    foldersHeading?.focus();
  }
</script>

<div
  class="mbs-pane-gap flex flex-col gap-pane-gap two-pane:max-inline-section"
>
  <section aria-labelledby="home-folder-heading">
    <h2
      id="home-folder-heading"
      class="px-xs text-caption font-semibold text-muted"
    >
      {m.library_settings_home_folder()}
    </h2>
    {#if folders.list.kind === "loaded" && folders.list.home !== undefined}
      <div class="mbs-sm rounded-card border border-border bg-card">
        <FolderRow folder={folders.list.home} />
      </div>
    {/if}
    <p class="mbs-sm px-xs text-caption text-muted">
      {m.library_settings_home_folder_hint()}
    </p>
  </section>

  <section aria-labelledby="folders-heading">
    <div class="flex items-center justify-between gap-md">
      <h2
        id="folders-heading"
        tabindex="-1"
        bind:this={foldersHeading}
        class="text-footnote font-semibold text-muted touch:max-medium:ps-xs touch:max-medium:text-group-title touch:max-medium:font-bold touch:max-medium:text-foreground touch:medium:text-label"
      >
        {m.library_settings_folders()}
      </h2>
      <AddFolderButton
        bind:element={addButton}
        {adding}
        placement="section-heading"
      />
    </div>
    <p class="mbs-sm text-footnote text-muted touch:max-medium:px-xs">
      {m.library_settings_folders_hint()}
    </p>
    {#if folders.list.kind === "loaded" && folders.list.linked.length > 0}
      <ul
        class="mbs-sm divide-y divide-border rounded-card border border-border bg-card"
      >
        {#each folders.list.linked as folder (folder.id)}
          <li>
            <FolderRow {folder}>
              {#snippet action()}
                <button
                  type="button"
                  aria-label={m.library_remove_folder_label({
                    name: folder.name,
                  })}
                  class="shrink-0 rounded-control px-md font-medium text-muted min-block-touch-target"
                  onclick={() => {
                    confirming = folder;
                  }}
                >
                  {m.library_remove_folder()}
                </button>
              {/snippet}
            </FolderRow>
          </li>
        {/each}
      </ul>
    {:else if folders.list.kind === "failed"}
      <p class="mbs-sm px-xs">{m.library_folders_failed()}</p>
    {/if}
    {#if notRemoved !== undefined}
      <p role="alert" class="mbs-sm px-xs">
        {m.library_remove_folder_failed({ name: notRemoved.name })}
      </p>
    {/if}
    <div class="mbs-sm">
      <FolderNotice
        {adding}
        {usesStandIns}
        onDismissed={() => {
          addButton?.focus();
        }}
      />
    </div>
  </section>
</div>

<RemoveFolderDialog
  folder={confirming}
  onConfirm={(folder: LibraryFolder) => {
    void remove(folder);
  }}
  onCancel={() => {
    confirming = undefined;
  }}
/>
