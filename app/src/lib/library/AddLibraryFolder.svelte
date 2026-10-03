<script lang="ts">
  import AddFolderButton from "./AddFolderButton.svelte";
  import type { AddFolder } from "./add-folder";
  import { FolderAdding } from "./folder-adding.svelte";
  import FolderAddingStatus from "./FolderAddingStatus.svelte";

  let {
    addFolder,
    onFinished,
  }: {
    addFolder: AddFolder;
    onFinished?: () => void;
  } = $props();

  const adding = new FolderAdding(
    (onProgress) => addFolder(onProgress),
    () => onFinished?.(),
  );
</script>

<AddFolderButton {adding} look="filled" class="max-medium:inline-full" />
<div class="mbs-sm">
  <FolderAddingStatus {adding} />
</div>
