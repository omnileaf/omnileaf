<script lang="ts">
  import type { LibraryFolder } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import type { Rescans } from "./rescans.svelte";

  let {
    folder,
    rescans,
    onFinished,
  }: {
    folder: LibraryFolder;
    rescans: Rescans;
    onFinished: () => void;
  } = $props();

  async function rescan(): Promise<void> {
    await rescans.rescan(folder);
    onFinished();
  }
</script>

<button
  type="button"
  aria-label={m.library_rescan_folder_label({ name: folderTitle(folder) })}
  disabled={rescans.isBusy}
  class="shrink-0 rounded-control px-sm font-medium text-muted min-block-touch-target disabled:opacity-60 medium:px-md"
  onclick={rescan}
>
  {m.library_rescan_folder()}
</button>
