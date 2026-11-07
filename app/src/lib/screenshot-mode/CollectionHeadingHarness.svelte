<script lang="ts">
  import type { Snippet } from "svelte";

  import type { Platform } from "#lib/ipc/bindings.ts";
  import {
    setSidebarSetting,
    SidebarSetting,
  } from "#lib/navigation/sidebar.svelte.ts";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";

  let {
    title,
    showsLabel = false,
    actions,
    platform,
    largeTitle,
  }: {
    title: string;
    showsLabel?: boolean;
    actions?: Snippet;
    platform: Platform;
    largeTitle?: boolean | undefined;
  } = $props();

  setSidebarSetting(new SidebarSetting(undefined));
</script>

<CollectionHeading {title} {showsLabel} {actions} {platform} {largeTitle} />
