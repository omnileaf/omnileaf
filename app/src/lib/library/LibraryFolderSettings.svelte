<script lang="ts">
  import { onMount } from "svelte";

  import type { Notices } from "$lib/notices/notices.svelte";
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

  onMount(() => {
    void folders.load();
  });
</script>

<div
  class="mbs-pane-gap flex flex-col gap-pane-gap two-pane:max-inline-section"
>
  <HomeFolder folders={folders.list}>
    <p class="mbs-sm px-xs text-caption text-muted">
      {m.library_settings_home_folder_hint()}
    </p>
  </HomeFolder>

  <LinkedFolders {folders} {addFolder} {notices} {usesStandIns}>
    {#snippet hint()}
      {m.library_settings_folders_hint()}
    {/snippet}
  </LinkedFolders>
</div>
