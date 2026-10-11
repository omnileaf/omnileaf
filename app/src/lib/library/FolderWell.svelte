<script lang="ts">
  import { Folder } from "@lucide/svelte";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";

  const FOLDER_ICON_SIZE = 18;

  let { folder, books }: { folder: LibraryFolder; books: number | undefined } =
    $props();

  const detail = $derived(
    books === undefined
      ? folder.location
      : m.library_remove_folder_detail({ location: folder.location, books }),
  );
</script>

<div class="flex items-center gap-md rounded-card bg-well px-list-row py-md">
  <span
    class="flex shrink-0 items-center justify-center rounded-control bg-card block-icon-tile inline-icon-tile"
  >
    <Folder size={FOLDER_ICON_SIZE} aria-hidden="true" />
  </span>
  <div class="flex flex-col min-inline-none">
    <p class="truncate text-callout font-semibold max-medium:text-body">
      {folderTitle(folder)}
    </p>
    <p class="text-footnote wrap-break-word text-muted">{detail}</p>
  </div>
</div>
