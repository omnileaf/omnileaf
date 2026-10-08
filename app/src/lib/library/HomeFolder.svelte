<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import FolderRow from "./FolderRow.svelte";
  import type { FolderList } from "./library-folders.svelte";

  let {
    folders,
    rowAction,
    class: className,
    children,
  }: {
    folders: FolderList;
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
        {#snippet action()}
          {@render rowAction?.(home)}
        {/snippet}
      </FolderRow>
    </div>
  {/if}
  {@render children?.()}
</section>
