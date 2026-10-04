<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import CollectionHeading from "$lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
</script>

<CollectionHeading
  title={m.library_title()}
  showsLabel={screenshotMode.showsLabel}
/>
<p class="mbs-sm text-muted">{m.library_empty()}</p>
<div class="mbs-lg">
  <AddLibraryFolder
    addFolder={commands.addLibraryFolder}
    notices={data.notices}
    usesStandIns={screenshotMode.isOn}
  />
</div>
