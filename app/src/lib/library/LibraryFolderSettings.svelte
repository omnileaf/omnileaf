<script lang="ts">
  import { onMount } from "svelte";

  import { m } from "$lib/paraglide/messages.js";

  import type { AddFolder } from "./add-folder";
  import HomeFolder from "./HomeFolder.svelte";
  import {
    LibraryFolders,
    type ListFolders,
    type RemoveFolder,
  } from "./library-folders.svelte";
  import LinkedFolders from "./LinkedFolders.svelte";

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

  onMount(() => {
    void folders.load();
  });
</script>

<HomeFolder folders={folders.list} class="mbs-xl">
  <p class="mbs-sm px-xs text-caption text-muted">
    {m.library_settings_home_folder_hint()}
  </p>
</HomeFolder>

<div class="mbs-xl">
  <LinkedFolders
    {folders}
    {addFolder}
    hint={m.library_settings_folders_hint()}
  />
</div>
