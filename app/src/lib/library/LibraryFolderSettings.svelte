<script lang="ts">
  import { onMount } from "svelte";

  import type { commands } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import AddLibraryFolder from "./AddLibraryFolder.svelte";
  import FolderRow from "./FolderRow.svelte";
  import { LibraryFolders, type ListFolders } from "./library-folders.svelte";

  let {
    listFolders,
    addFolder,
  }: {
    listFolders: ListFolders;
    addFolder: typeof commands.addLibraryFolder;
  } = $props();

  const folders = new LibraryFolders((after) => listFolders(after));

  onMount(() => {
    void folders.load();
  });
</script>

<section aria-labelledby="home-folder-heading" class="mbs-xl">
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

<section aria-labelledby="folders-heading" class="mbs-xl">
  <h2 id="folders-heading" class="px-xs text-caption font-semibold text-muted">
    {m.library_settings_folders()}
  </h2>
  {#if folders.list.kind === "loaded" && folders.list.linked.length > 0}
    <ul
      class="mbs-sm divide-y divide-border rounded-card border border-border bg-card"
    >
      {#each folders.list.linked as folder (folder.id)}
        <li><FolderRow {folder} /></li>
      {/each}
    </ul>
  {:else if folders.list.kind === "failed"}
    <p class="mbs-sm px-xs">{m.library_folders_failed()}</p>
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
