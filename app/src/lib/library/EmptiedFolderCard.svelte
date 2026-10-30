<script lang="ts">
  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import {
    EMPTIED_FOLDER_LOOKS,
    type EmptiedFolderLook,
  } from "./emptied-folder-looks";
  import { folderTitle } from "./folder-title";
  import type { EmptiedFolder } from "./rescans.svelte";

  type ButtonClick = MouseEvent & { currentTarget: HTMLButtonElement };

  let {
    folder,
    emptied,
    isBusy,
    onRescan,
    onRemove,
  }: {
    folder: LibraryFolder;
    emptied: EmptiedFolder;
    isBusy: boolean;
    onRescan: (asker: HTMLButtonElement) => void;
    onRemove: (asker: HTMLButtonElement) => void;
  } = $props();

  const titleId = $props.id();
  const look: EmptiedFolderLook = $derived(EMPTIED_FOLDER_LOOKS[emptied]);
  const name = $derived(folderTitle(folder));
</script>

<Alert
  tone="warning"
  icon={look.icon}
  role={look.role}
  aria-labelledby={titleId}
  class="mx-sm mbe-sm"
>
  <AlertTitle id={titleId} level={3}>{look.title({ name })}</AlertTitle>
  <AlertDescription class="text-body text-foreground opacity-100"
    >{look.body({ name })}</AlertDescription
  >
  <AlertActions>
    <AlertButton
      emphasis="strong"
      disabled={isBusy}
      onclick={(event: ButtonClick) => {
        onRemove(event.currentTarget);
      }}
    >
      {look.remove()}
    </AlertButton>
    <AlertButton
      emphasis="quiet"
      disabled={isBusy}
      onclick={(event: ButtonClick) => {
        onRescan(event.currentTarget);
      }}
    >
      {m.library_rescan_folder()}
    </AlertButton>
  </AlertActions>
</Alert>
