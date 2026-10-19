<script lang="ts">
  import { Folder, House } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import type { LibraryFolder } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle } from "./folder-title";
  import { ICON_SIZE } from "./icon-size";

  const SEPARATOR = " · ";

  let {
    folder,
    isFoundEmpty = false,
    location,
    action,
  }: {
    folder: LibraryFolder;
    isFoundEmpty?: boolean;
    location?: Snippet;
    action?: Snippet;
  } = $props();

  const status = $derived.by((): string | undefined => {
    if (isFoundEmpty) {
      return m.library_folder_found_empty();
    }
    return folder.isAvailable ? undefined : m.library_folder_unavailable();
  });
</script>

<Item look="folder">
  <ItemMedia
    class={[
      "rounded-control block-icon-tile inline-icon-tile",
      folder.kind === "home" ? "bg-accent-soft" : "bg-chip",
    ]}
  >
    {#if folder.kind === "home"}
      <House size={ICON_SIZE} aria-hidden="true" />
    {:else}
      <Folder size={ICON_SIZE} aria-hidden="true" />
    {/if}
  </ItemMedia>
  <ItemContent class="min-inline-none">
    <ItemTitle class="truncate text-body font-medium"
      >{folderTitle(folder)}</ItemTitle
    >
    <ItemDescription class="truncate text-detail">
      {#if status !== undefined}<span>{status}</span>{SEPARATOR}{/if}
      {#if location === undefined}
        {folder.location}
      {:else}
        {@render location()}
      {/if}
    </ItemDescription>
  </ItemContent>
  {@render action?.()}
</Item>
