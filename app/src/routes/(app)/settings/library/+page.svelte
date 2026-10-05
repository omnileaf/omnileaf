<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import LibraryFolderSettings from "$lib/library/LibraryFolderSettings.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
</script>

<SectionHeading title={m.library_title()} />
<LibraryFolderSettings
  listFolders={commands.libraryFolders}
  removeFolder={commands.removeLibraryFolder}
  addFolder={addFolderWithProgress}
  notices={data.notices}
  usesStandIns={screenshotMode.isOn}
/>
