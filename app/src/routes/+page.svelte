<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddFolderButton from "$lib/library/AddFolderButton.svelte";
  import { FolderAdding } from "$lib/library/folder-adding.svelte";
  import FolderNotice from "$lib/library/FolderNotice.svelte";
  import LibraryGlyph from "$lib/navigation/LibraryGlyph.svelte";
  import EmptyState from "$lib/page/EmptyState.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import CollectionHeading from "$lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const adding = new FolderAdding(
    commands.addLibraryFolder,
    () => data.notices,
  );

  let addFolder: HTMLButtonElement | undefined = $state();
</script>

<div class="flex items-center justify-between gap-sm">
  <CollectionHeading
    title={m.library_title()}
    showsLabel={screenshotMode.showsLabel}
  />
  <AddFolderButton {adding} placement="page-heading" />
</div>
<EmptyState
  icon={LibraryGlyph}
  title={m.library_empty()}
  body={m.library_empty_body()}
>
  <div class="mbs-sm flex flex-col items-center gap-md max-inline-prose">
    <AddFolderButton
      bind:element={addFolder}
      {adding}
      placement="empty-state"
    />
    <FolderNotice
      {adding}
      usesStandIns={screenshotMode.isOn}
      onDismissed={() => {
        addFolder?.focus();
      }}
    />
  </div>
</EmptyState>
