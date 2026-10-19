<script lang="ts">
  import { Download } from "@lucide/svelte";

  import type { LibrarySeries, OnCovers } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { seriesSelection } from "./series-selection";
  import UnreadCount from "./UnreadCount.svelte";

  const MARK_ICON_SIZE = 12;

  let { series, onCovers }: { series: LibrarySeries; onCovers: OnCovers } =
    $props();

  const selection = seriesSelection();
  const isSelecting = $derived(selection?.isSelecting === true);
  const languageNames = $derived(
    new Intl.DisplayNames([getLocale()], { type: "language" }),
  );
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
  <UnreadCount
    count={series.unreadCount}
    class="absolute inset-s-badge-inset inset-bs-badge-inset flex items-center justify-center px-badge-inline text-caption min-block-xl min-inline-xl medium:inset-s-badge-inset-wide medium:inset-bs-badge-inset-wide large:inset-s-sm large:inset-bs-sm"
  />
{/if}
{#if !isSelecting && (language !== undefined || showsDownloads)}
  <span
    class="absolute inset-e-badge-inset inset-bs-badge-inset flex items-center gap-2xs medium:inset-e-badge-inset-wide medium:inset-bs-badge-inset-wide large:inset-e-sm large:inset-bs-sm"
  >
    {#if language !== undefined}
      <span
        role="img"
        aria-label={languageNames.of(language) ?? language}
        class="rounded-badge bg-card px-badge-inline py-badge-block text-badge font-semibold text-foreground uppercase medium:px-badge-inline-wide medium:py-badge-block-wide"
      >
        {language}
      </span>
    {/if}
    {#if showsDownloads}
      <span
        role="img"
        aria-label={m.library_downloaded_chapters()}
        class="flex items-center justify-center rounded-full bg-accent text-on-accent block-downloaded-mark inline-downloaded-mark"
      >
        <Download size={MARK_ICON_SIZE} aria-hidden="true" />
      </span>
    {/if}
  </span>
{/if}
