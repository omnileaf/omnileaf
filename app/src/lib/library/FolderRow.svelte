<script lang="ts">
  import { Folder, House } from "@lucide/svelte";

  import type { LibraryFolder } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  const ICON_SIZE = 20;

  let { folder }: { folder: LibraryFolder } = $props();

  const title = $derived(folder.kind === "home" ? m.app_name() : folder.name);
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
    <p class="truncate font-semibold">{title}</p>
    <p class="truncate text-caption text-muted">{folder.location}</p>
  </div>
</div>
