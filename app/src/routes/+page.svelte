<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddFolderButton from "$lib/library/AddFolderButton.svelte";
  import { FolderAdding } from "$lib/library/folder-adding.svelte";
  import FolderNotice from "$lib/library/FolderNotice.svelte";
  import LibraryGlyph from "$lib/navigation/LibraryGlyph.svelte";
  import EmptyState from "$lib/page/EmptyState.svelte";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";

  const adding = new FolderAdding(commands.addLibraryFolder);
</script>

<div class="flex items-center justify-between gap-sm">
  <PageHeading title={m.library_title()} />
  <AddFolderButton {adding} placement="page-heading" />
</div>
<EmptyState
  icon={LibraryGlyph}
  title={m.library_empty()}
  body={m.library_empty_body()}
>
  <div class="mbs-sm flex flex-col items-center gap-md max-inline-prose">
    <AddFolderButton {adding} placement="empty-state" />
    <FolderNotice {adding} />
  </div>
</EmptyState>
