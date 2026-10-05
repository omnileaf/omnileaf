<script lang="ts">
  import { onMount } from "svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
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
  import RescanButton from "./RescanButton.svelte";
  import type { RescanFolder } from "./rescan-folder";
  import { Rescans } from "./rescans.svelte";
  import RescanStatus from "./RescanStatus.svelte";

  let {
    listFolders,
    removeFolder,
    addFolder,
    rescanFolder,
    notices,
    usesStandIns,
  }: {
    listFolders: ListFolders;
    removeFolder: RemoveFolder;
    addFolder: AddFolder;
    rescanFolder: RescanFolder;
    notices: Notices;
    usesStandIns: boolean;
  } = $props();

  const folders = new LibraryFolders(
    (after) => listFolders(after),
    (id) => removeFolder(id),
  );
  const rescans = new Rescans((id, onProgress) => rescanFolder(id, onProgress));

  onMount(() => {
    void folders.load();
  });
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
  <HomeFolder folders={folders.list} rowAction={rescanButton}>
    <RescanStatus status={rescans.status} kind="home" />
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
      <RescanStatus status={rescans.status} kind="linked" />
    {/snippet}
    {#snippet hint()}
      {m.library_settings_folders_hint()}
    {/snippet}
  </LinkedFolders>
</div>
