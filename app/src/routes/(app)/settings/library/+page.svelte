<script lang="ts">
  import { commands } from "#lib/ipc/bindings.ts";
  import { addFolderWithProgress } from "#lib/library/add-folder.ts";
  import LibraryFolderSettings from "#lib/library/LibraryFolderSettings.svelte";
  import { rescanFolderWithProgress } from "#lib/library/rescan-folder.ts";
  import { getNotices } from "#lib/notices/notices.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import SectionHeading from "#lib/settings/SectionHeading.svelte";

  const screenshotMode = getScreenshotMode();
  const notices = getNotices();
</script>

<SectionHeading title={m.library_title()} />
<LibraryFolderSettings
  listFolders={commands.libraryFolders}
  removeFolder={commands.removeLibraryFolder}
  countFolderBooks={commands.libraryFolderBookCount}
  addFolder={addFolderWithProgress}
  rescanFolder={rescanFolderWithProgress}
  {notices}
  usesStandIns={screenshotMode.isOn}
/>
