<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<PageHeading title={m.library_title()} />
<p class="mbs-sm text-muted">{m.library_empty()}</p>
<div class="mbs-lg">
  <AddLibraryFolder addFolder={commands.addLibraryFolder} />
</div>
