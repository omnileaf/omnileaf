<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import { m } from "$lib/paraglide/messages.js";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.library_title()}</h1>
<p class="mbs-sm text-muted">{m.library_empty()}</p>
<div class="mbs-lg">
  <AddLibraryFolder
    addFolder={commands.addLibraryFolder}
    notices={data.notices}
  />
</div>
