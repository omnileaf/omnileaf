<script lang="ts">
  import type { LibrarySeries, OnCovers } from "#lib/ipc/bindings.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { coverTileLook } from "./cover-tile";
  import DownloadedMark from "./DownloadedMark.svelte";
  import LanguageBadge from "./LanguageBadge.svelte";
  import { seriesSelection } from "./series-selection";
  import UnreadCount from "./UnreadCount.svelte";

  let { series, onCovers }: { series: LibrarySeries; onCovers: OnCovers } =
    $props();

  const selection = seriesSelection();
  const tile = coverTileLook(currentPlatform());
  const isSelecting = $derived(selection?.isSelecting === true);
  const language = $derived(
    onCovers.showsLanguage && series.language !== null
      ? series.language
      : undefined,
  );
  const showsDownloads = $derived(
    onCovers.showsDownloaded && series.hasDownloads,
  );
</script>

{#if onCovers.showsUnreadCount}
  <UnreadCount count={series.unreadCount} class={tile.unread} />
{/if}
{#if !isSelecting && (language !== undefined || showsDownloads)}
  <span
    class="absolute inset-e-badge-inset inset-bs-badge-inset flex items-center gap-2xs medium:inset-e-badge-inset-wide medium:inset-bs-badge-inset-wide large:inset-e-sm large:inset-bs-sm"
  >
    {#if language !== undefined}
      <LanguageBadge
        {language}
        class={[
          "medium:px-badge-inline-wide medium:py-badge-block-wide",
          tile.badge,
        ]}
      />
    {/if}
    {#if showsDownloads}
      <DownloadedMark class={tile.downloaded} iconClass={tile.downloadedIcon} />
    {/if}
  </span>
{/if}
