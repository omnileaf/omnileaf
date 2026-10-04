<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddFolderButton from "$lib/library/AddFolderButton.svelte";
  import { FolderAdding } from "$lib/library/folder-adding.svelte";
  import FolderNotice from "$lib/library/FolderNotice.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const foldersHeadingId = $props.id();

  const adding = new FolderAdding(
    commands.addLibraryFolder,
    () => data.notices,
  );

  let addFolder: HTMLButtonElement | undefined = $state();
</script>

<SectionHeading title={m.library_title()} />
<section
  aria-labelledby={foldersHeadingId}
  class="mbs-pane-gap flex flex-col gap-sm two-pane:max-inline-section"
>
  <div class="flex items-center justify-between gap-md">
    <h2
      id={foldersHeadingId}
      class="text-footnote font-semibold text-muted touch:max-medium:ps-xs touch:max-medium:text-group-title touch:max-medium:font-bold touch:max-medium:text-foreground touch:medium:text-label"
    >
      {m.library_settings_folders()}
    </h2>
    <AddFolderButton
      bind:element={addFolder}
      {adding}
      placement="section-heading"
    />
  </div>
  <p class="text-footnote text-muted touch:max-medium:px-xs">
    {m.library_settings_folders_hint()}
  </p>
  <div class="mbs-xs">
    <FolderNotice
      {adding}
      usesStandIns={screenshotMode.isOn}
      onDismissed={() => {
        addFolder?.focus();
      }}
    />
  </div>
</section>
