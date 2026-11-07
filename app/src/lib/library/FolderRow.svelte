<script lang="ts" generics="Shown extends ShownFolder">
  import { Folder, House } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { Icon } from "#lib/components/ui/icon/index.ts";
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
  import { AndroidPhone } from "./android-phone.svelte";
  import { ICON_SIZE } from "./icon-size";

  const SEPARATOR = " · ";
  const IOS_ICON_SIZE = 22;

  const LOOKS = {
    android: {
      title: "text-native-row-title/native-row-title font-regular",
      description: "text-native-row-subtitle/native-row-subtitle wrap-anywhere",
      detail: "text-native-row-subtitle/native-row-subtitle text-muted",
    },
    ios: {
      title: "truncate",
      description: "truncate",
      detail: "text-footnote text-muted",
    },
    standard: {
      title: "truncate text-body font-medium",
      description: "truncate text-detail",
      detail: "text-footnote text-muted",
    },
  } as const;

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
  const android = new AndroidPhone();
  const look = $derived(
    android.isOn ? LOOKS.android : isNative ? LOOKS.ios : LOOKS.standard,
  );

  const glyphSize = $derived(isNative ? IOS_ICON_SIZE : ICON_SIZE);

  const status = $derived.by((): string | undefined => {
    if (isFoundEmpty) {
      return m.library_folder_found_empty();
    }
    return folder.isAvailable ? undefined : m.library_folder_unavailable();
  });
</script>

<Item
  look={android.isOn ? "row" : isNative ? "row-static" : "folder"}
  class={[
    isOwnCard && "windows:py-md windows:pe-lg",
    android.isOn && "items-start",
  ]}
>
  {#if look === LOOKS.android}
    <Icon
      name={folder.kind === "home" ? "house" : "folder"}
      class="self-start"
    />
  {:else}
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
        <House size={glyphSize} aria-hidden="true" />
      {:else}
        <Folder size={glyphSize} aria-hidden="true" />
      {/if}
    </ItemMedia>
  {/if}
  <ItemContent>
    <ItemTitle class={look.title}>{folderTitle(folder)}</ItemTitle>
    <ItemDescription class={look.description}>
      {#if status !== undefined}<span>{status}</span>{SEPARATOR}{/if}
      {#if location === undefined}
        {folder.location}
      {:else}
        {@render location()}
      {/if}
    </ItemDescription>
    {#if detail !== undefined}
      <div class={look.detail}>{@render detail(folder)}</div>
    {/if}
  </ItemContent>
  {#if android.isOn}
    <span class="flex items-center self-center">{@render action?.()}</span>
  {:else}
    {@render action?.()}
  {/if}
</Item>
