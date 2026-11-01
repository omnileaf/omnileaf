<script lang="ts">
  import { FolderOpen, FolderSearch, RefreshCw } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type { Platform } from "#lib/ipc/bindings.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { showFolderLabel } from "#lib/page/show-file.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoonControl from "./ComingSoonControl.svelte";
  import { SERIES_CONTROL } from "./series-control.ts";

  const ICON_SIZE = 16;
  const TOUCH: readonly Platform[] = ["android", "ios"];

  let {
    platform,
    onRescan,
    onShowFolder,
  }: {
    platform: Platform;
    onRescan: () => Promise<void>;
    onShowFolder: () => void;
  } = $props();

  const nativeOrder = $derived(
    platform === "windows"
      ? (["rescan", "show"] as const)
      : (["show", "rescan"] as const),
  );
  const showFolder = $derived(
    TOUCH.includes(platform)
      ? m.series_show_folder()
      : m.series_show_in_folder(),
  );
</script>

<div class="rounded-card border border-border bg-card py-2xl">
  <EmptyState
    icon={FolderSearch}
    title={m.series_no_books()}
    body={m.series_no_books_body()}
  >
    {#if platform === "macos" || platform === "windows"}
      <div class="mbs-empty-button-macos flex flex-wrap justify-center gap-sm">
        {#each nativeOrder as action (action)}
          {#if action === "rescan"}
            <Button
              type="button"
              variant="primary"
              size="large"
              onClickPromise={onRescan}
            >
              <RefreshCw size={ICON_SIZE} aria-hidden="true" />
              {m.series_rescan()}
            </Button>
          {:else}
            <Button
              type="button"
              variant="secondary"
              size="large"
              onclick={onShowFolder}
            >
              <FolderOpen size={ICON_SIZE} aria-hidden="true" />
              {showFolderLabel(platform)}
            </Button>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="mbs-lg flex flex-wrap justify-center gap-sm">
        <Button
          type="button"
          look="primary"
          class="flex items-center gap-sm rounded-shadcn-button px-lg font-medium min-block-touch-target expanded:text-small expanded:min-block-pointer-button"
          onClickPromise={onRescan}
        >
          <RefreshCw size={ICON_SIZE} aria-hidden="true" />
          {m.series_rescan()}
        </Button>
        <ComingSoonControl label={showFolder} class={SERIES_CONTROL}>
          <FolderOpen size={ICON_SIZE} aria-hidden="true" />
          {showFolder}
        </ComingSoonControl>
      </div>
    {/if}
  </EmptyState>
</div>
