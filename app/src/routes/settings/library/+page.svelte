<script lang="ts">
  import { commands } from "$lib/ipc/bindings";
  import AddLibraryFolder from "$lib/library/AddLibraryFolder.svelte";
  import { m } from "$lib/paraglide/messages.js";
  import { getScreenshotMode } from "$lib/screenshot-mode/screenshot-mode.svelte";

  const screenshotMode = getScreenshotMode();
</script>

<h1 tabindex="-1" class="text-headline font-bold">{m.library_title()}</h1>
<section class="mbs-xl">
  <h2 class="text-title font-bold">{m.library_settings_folders()}</h2>
  <p class="mbs-xs text-muted">{m.library_settings_folders_hint()}</p>
  <div class="mbs-lg">
    <AddLibraryFolder
      addFolder={commands.addLibraryFolder}
      usesStandIns={screenshotMode.isOn}
    />
  </div>
</section>
