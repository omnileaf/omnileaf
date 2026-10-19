<script lang="ts">
  import type { LibrarySeries, OnCovers } from "#lib/ipc/bindings.ts";

  import UnreadCount from "./UnreadCount.svelte";

  let { series, onCovers }: { series: LibrarySeries; onCovers: OnCovers } =
    $props();
</script>

{#if onCovers.showsUnreadCount}
  <UnreadCount
    count={series.unreadCount}
    class="absolute inset-s-badge-inset inset-bs-badge-inset flex items-center justify-center px-badge-inline text-caption min-block-xl min-inline-xl medium:inset-s-badge-inset-wide medium:inset-bs-badge-inset-wide large:inset-s-sm large:inset-bs-sm"
  />
{/if}
