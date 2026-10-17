<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  import { HardDrive } from "@lucide/svelte";

  import type { LibraryFolder, Platform } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { folderLocation } from "./folder-location";
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

  const ICON_SIZE = 18;
  const headingId = $props.id();
</script>

<section aria-labelledby={headingId} class={className}>
  {#if folders.kind === "loaded" && folders.home !== undefined}
    {@const home = folders.home}
    <div
      class="flex items-center gap-md rounded-card border border-border bg-card px-lg py-md android:rounded-android-md android:border-transparent android:bg-android-container-low ios-grouped:rounded-ios-cell ios-grouped:border-transparent ios-grouped:bg-ios-cell"
    >
      <span
        aria-hidden="true"
        class="flex shrink-0 items-center justify-center rounded-tile border border-border bg-card block-entry-tile inline-entry-tile ios:rounded-settings-chip-ios ios:border-transparent ios:bg-ios-chip-grey ios:text-reader-white ios:block-settings-chip-ios ios:inline-settings-chip-ios android:rounded-full android:border-transparent android:bg-android-tonal android:block-settings-chip android:inline-settings-chip"
      >
        <HardDrive size={ICON_SIZE} />
      </span>
      <div class="flex flex-1 flex-col gap-2xs min-inline-none">
        <h2 id={headingId} class="text-body font-medium desktop:font-semibold">
          {m.library_settings_home_folder()}
        </h2>
        <code class="font-mono text-detail wrap-anywhere text-muted">
          {folderLocation(home, platform)}
        </code>
      </div>
      {@render rowAction?.(home)}
    </div>
  {:else}
    <h2 id={headingId} class="px-xs text-caption font-semibold text-muted">
      {m.library_settings_home_folder()}
    </h2>
  {/if}
  {@render children?.()}
</section>
