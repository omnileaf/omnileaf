<script lang="ts">
  import { Folder, House } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import { ICON_SIZE } from "./icon-size";

  let { folder, action }: { folder: LibraryFolder; action?: Snippet } =
    $props();
</script>

<div
  class="flex items-center gap-md py-sm ps-md pe-sm min-block-row expanded:min-block-row-compact"
>
  <span
    class={[
      "flex shrink-0 items-center justify-center rounded-control block-icon-tile inline-icon-tile",
      folder.kind === "home" ? "bg-accent-soft" : "bg-chip",
    ]}
  >
    {#if folder.kind === "home"}
      <House size={ICON_SIZE} aria-hidden="true" />
    {:else}
      <Folder size={ICON_SIZE} aria-hidden="true" />
    {/if}
  </span>
  <div class="flex-1 min-inline-none">
    <p class="truncate font-semibold">{folderTitle(folder)}</p>
    {#if !folder.isAvailable}
      <p
        class="mbs-2xs rounded-badge bg-warning-soft px-xs text-caption font-semibold inline-fit"
      >
        {m.library_folder_unavailable()}
      </p>
    {/if}
    <p class="truncate text-caption text-muted">{folder.location}</p>
  </div>
  {@render action?.()}
</div>
