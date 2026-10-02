<script lang="ts">
  import { addFolderWithProgress } from "$lib/library/add-folder";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.library_title()}</h1>
<p class="mbs-sm text-muted">{m.library_empty()}</p>
<div class="mbs-lg">
  <AddLibraryFolder addFolder={addFolderWithProgress} />
</div>
