<script lang="ts">
  import { CircleAlert, FolderSearch } from "@lucide/svelte";

  import {
    Alert,
    AlertActions,
    AlertButton,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.ts";
  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import type { Glyph } from "#lib/page/glyph.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import type { EmptiedFolder } from "./rescans.svelte";

  type ButtonClick = MouseEvent & { currentTarget: HTMLButtonElement };

  interface Look {
    readonly role: "status" | "alert";
    readonly icon: Glyph;
    readonly title: (inputs: { name: string }) => string;
    readonly body: (inputs: { name: string }) => string;
    readonly remove: () => string;
  }

  const LOOKS = {
    foundEmpty: {
      role: "status",
      icon: FolderSearch,
      title: m.library_found_empty_title,
      body: m.library_found_empty_body,
      remove: m.library_remove_books,
    },
    removalFailed: {
      role: "alert",
      icon: CircleAlert,
      title: m.library_remove_books_failed,
      body: m.library_remove_books_failed_body,
      remove: m.library_remove_books_try_again,
    },
  } satisfies Record<EmptiedFolder, Look>;

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
  const look: Look = $derived(LOOKS[emptied]);
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
  <AlertDescription>{look.body({ name })}</AlertDescription>
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
