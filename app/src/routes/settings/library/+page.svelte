<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import SectionHeading from "$lib/settings/SectionHeading.svelte";

  const foldersHeadingId = $props.id();
</script>

<SectionHeading title={m.library_title()} />
<section
  aria-labelledby={foldersHeadingId}
  class="mbs-lg flex flex-col gap-sm two-pane:max-inline-section"
>
  <h2
    id={foldersHeadingId}
    class="px-xs text-footnote font-semibold text-muted"
  >
    {m.library_settings_folders()}
  </h2>
  <div class="mbs-xs flex flex-col two-pane:items-start">
    <AddLibraryFolder addFolder={commands.addLibraryFolder} />
  </div>
  <p class="px-xs text-footnote text-muted">
    {m.library_settings_folders_hint()}
  </p>
</section>
