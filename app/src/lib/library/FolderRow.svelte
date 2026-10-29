<script lang="ts" generics="Shown extends ShownFolder">
  import { Folder, House } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderTitle, type ShownFolder } from "./folder-title";
  import { ICON_SIZE } from "./icon-size";

  const SEPARATOR = " · ";
  const NATIVE_ICON_SIZE = 22;

  let {
    folder,
    isFoundEmpty = false,
    isOwnCard = false,
    location,
    detail,
    action,
  }: {
    folder: Shown;
    isFoundEmpty?: boolean;
    isOwnCard?: boolean;
    location?: Snippet;
    detail?: Snippet<[Shown]> | undefined;
    action?: Snippet;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isNative = $derived(phoneOf(platform, width.current) === "ios");
  const iconSize = $derived(isNative ? NATIVE_ICON_SIZE : ICON_SIZE);

  const status = $derived.by((): string | undefined => {
    if (isFoundEmpty) {
      return m.library_folder_found_empty();
    }
    return folder.isAvailable ? undefined : m.library_folder_unavailable();
  });
</script>

<Item
  look={isNative ? "row" : "folder"}
  class={[isOwnCard && "windows:py-md windows:pe-lg"]}
>
  <ItemMedia
    class={isNative
      ? "text-accent"
      : [
          "rounded-control block-icon-tile inline-icon-tile",
          folder.kind === "home" ? "bg-accent-soft" : "bg-chip",
          isOwnCard && "windows:bg-transparent",
        ]}
  >
    {#if folder.kind === "home"}
      <House size={iconSize} aria-hidden="true" />
    {:else}
      <Folder size={iconSize} aria-hidden="true" />
    {/if}
  </ItemMedia>
  <ItemContent>
    <ItemTitle class={isNative ? "truncate" : "truncate text-body font-medium"}
      >{folderTitle(folder)}</ItemTitle
    >
    <ItemDescription class={isNative ? "truncate" : "truncate text-detail"}>
      {#if status !== undefined}<span>{status}</span>{SEPARATOR}{/if}
      {#if location === undefined}
        {folder.location}
      {:else}
        {@render location()}
      {/if}
    </ItemDescription>
    {#if detail !== undefined}
      <div class="text-footnote text-muted">{@render detail(folder)}</div>
    {/if}
  </ItemContent>
  {@render action?.()}
</Item>
