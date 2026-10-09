<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
  import WidthWording from "#lib/page/WidthWording.svelte";
  import { m } from "#lib/paraglide/messages.js";

  import { folderLocation } from "./folder-location";
  import FolderRow from "./FolderRow.svelte";
  import type { FolderList } from "./library-folders.svelte";

  let {
    folders,
    platform,
    rowAction,
    class: className,
    children,
  }: {
    folders: FolderList;
    platform: Platform;
    rowAction?: Snippet<[LibraryFolder]>;
    class?: ClassValue;
    children?: Snippet;
  } = $props();

  const headingId = $props.id();
</script>

<section aria-labelledby={headingId} class={className}>
  <h2 id={headingId} class="px-xs text-caption font-semibold text-muted">
    {m.library_settings_home_folder()}
  </h2>
  {#if folders.kind === "loaded" && folders.home !== undefined}
    {@const home = folders.home}
    <div class="mbs-sm rounded-card border border-border bg-card">
      <FolderRow folder={home}>
        {#snippet location()}
          <WidthWording wording={folderLocation(home, platform)} />
        {/snippet}
        {#snippet action()}
          {@render rowAction?.(home)}
        {/snippet}
      </FolderRow>
    </div>
  {/if}
  {@render children?.()}
</section>
