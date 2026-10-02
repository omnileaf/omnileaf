<script lang="ts">
  import { BookOpen } from "@lucide/svelte";

  import { commands } from "$lib/ipc/bindings";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import EmptyState from "$lib/page/EmptyState.svelte";
  import PageHeading from "$lib/page/PageHeading.svelte";
  import { m } from "$lib/paraglide/messages.js";
</script>

<PageHeading title={m.library_title()} />
<EmptyState
  icon={BookOpen}
  title={m.library_empty()}
  body={m.library_empty_body()}
>
  <div class="mbs-sm">
    <AddLibraryFolder addFolder={commands.addLibraryFolder} />
  </div>
</EmptyState>
