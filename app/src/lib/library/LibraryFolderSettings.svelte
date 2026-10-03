<script lang="ts">
  import { onMount } from "svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import AddLibraryFolder from "./AddLibraryFolder.svelte";
  import FolderRow from "./FolderRow.svelte";
  import HomeFolder from "./HomeFolder.svelte";
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
  }: {
    listFolders: ListFolders;
    removeFolder: RemoveFolder;
    addFolder: AddFolder;
  } = $props();

  const folders = new LibraryFolders(
    (after) => listFolders(after),
    (id) => removeFolder(id),
  );

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
    foldersHeading?.focus();
  }
</script>

<HomeFolder folders={folders.list} class="mbs-xl">
  <p class="mbs-sm px-xs text-caption text-muted">
    {m.library_settings_home_folder_hint()}
  </p>
</HomeFolder>

<section aria-labelledby="folders-heading" class="mbs-xl">
  <h2
    id="folders-heading"
    tabindex="-1"
    bind:this={foldersHeading}
    class="px-xs text-caption font-semibold text-muted"
  >
    {m.library_settings_folders()}
  </h2>
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
  <div class="mbs-md">
    <AddLibraryFolder
      {addFolder}
      onAdded={() => {
        void folders.load();
      }}
    />
  </div>
  <p class="mbs-sm px-xs text-caption text-muted">
    {m.library_settings_folders_hint()}
  </p>
</section>

<RemoveFolderDialog
  folder={confirming}
  onConfirm={(folder: LibraryFolder) => {
    void remove(folder);
  }}
  onCancel={() => {
    confirming = undefined;
  }}
/>
