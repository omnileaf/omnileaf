<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<PageHeading title={m.library_title()} />
<section class="mbs-xl">
  <h2 class="text-title font-bold">{m.library_settings_folders()}</h2>
  <p class="mbs-xs text-muted">{m.library_settings_folders_hint()}</p>
  <div class="mbs-lg">
    <AddLibraryFolder addFolder={commands.addLibraryFolder} />
  </div>
</section>
