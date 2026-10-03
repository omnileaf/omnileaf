<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import LibraryFolderSettings from "$lib/library/LibraryFolderSettings.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.library_title()}</h1>
<LibraryFolderSettings
  listFolders={commands.libraryFolders}
  removeFolder={commands.removeLibraryFolder}
  addFolder={addFolderWithProgress}
/>
