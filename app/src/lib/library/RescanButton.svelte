<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import { ACTION_ICON_SIZE } from "./icon-size";
  import type { Rescans } from "./rescans.svelte";
  import RowActionButton from "./RowActionButton.svelte";

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

<RowActionButton
  label={m.library_rescan_folder_label({ name: folderTitle(folder) })}
  tooltip={m.library_rescan_folder()}
  disabled={rescans.isBusy}
  onclick={() => {
    void rescan();
  }}
>
  <RefreshCw
    size={ACTION_ICON_SIZE}
    aria-hidden="true"
    class={[rescans.isRescanning(folder) && "motion-safe:animate-spin"]}
  />
</RowActionButton>
