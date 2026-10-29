<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { HardDrive } from "@lucide/svelte";

  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { phoneOf } from "#lib/page/platform.ts";
  import { CARD_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderLocation } from "./folder-location";
  import type { FolderList } from "./library-folders.svelte";

  let {
    folders,
    platform,
    change,
    rowAction,
    class: className,
    children,
  }: {
    folders: FolderList;
    platform: Platform;
    change?: Snippet | undefined;
    rowAction?: Snippet<[LibraryFolder]>;
    class?: ClassValue;
    children?: Snippet;
  } = $props();

  const ICON_SIZE = 18;
  const NATIVE_TITLE =
    "text-native-row-title/native-row-title font-native-row-title tracking-native-row-title";
  const NATIVE_PLACE = `font-ui ${ROW_SUBTITLE_TYPE} wrap-anywhere text-muted`;
  const headingId = $props.id();
  const width = new WindowWidth();
  const isNative = $derived(phoneOf(platform, width.current) === "ios");
</script>

<section aria-labelledby={headingId} class={className}>
  {#if folders.kind === "loaded" && folders.home !== undefined}
    {@const home = folders.home}
    <div
      class={[
        "flex flex-wrap items-center gap-md rounded-card border border-border bg-card px-lg py-md",
        CARD_PLATE,
      ]}
    >
      <div
        class={[
          "flex flex-1 items-center gap-md min-inline-none",
          change !== undefined && "max-medium:basis-full",
        ]}
      >
        <span
          aria-hidden="true"
          class="flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile ios:rounded-settings-chip-ios ios:border-transparent ios:bg-ios-chip-grey ios:text-reader-white ios:block-settings-chip-ios ios:inline-settings-chip-ios android:rounded-full android:border-transparent android:bg-android-tonal android:block-settings-chip android:inline-settings-chip"
        >
          <HardDrive size={ICON_SIZE} />
        </span>
        <div class="flex flex-1 flex-col gap-2xs min-inline-none">
          <h2
            id={headingId}
            class={isNative
              ? NATIVE_TITLE
              : "text-body font-medium desktop:font-semibold"}
          >
            {m.library_settings_home_folder()}
          </h2>
          <code
            class={isNative
              ? NATIVE_PLACE
              : "font-mono text-detail wrap-anywhere text-muted"}
          >
            {folderLocation(home, platform)}
          </code>
        </div>
      </div>
      <div class="ms-auto flex shrink-0 items-center gap-md">
        {@render change?.()}
        {@render rowAction?.(home)}
      </div>
    </div>
  {:else}
    <h2 id={headingId} class="px-xs text-caption font-semibold text-muted">
      {m.library_settings_home_folder()}
    </h2>
  {/if}
  {@render children?.()}
</section>
