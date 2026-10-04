<script lang="ts">
  import type { LibrarySeries, OnCovers } from "$lib/ipc/bindings";

  import UnreadCount from "./UnreadCount.svelte";

  let { series, onCovers }: { series: LibrarySeries; onCovers: OnCovers } =
    $props();
</script>

{#if onCovers.showsUnreadCount}
  <UnreadCount
    count={series.unreadCount}
    class="absolute inset-s-badge-inset inset-bs-badge-inset rounded-badge px-badge-inline py-badge-block text-badge medium:inset-s-badge-inset-wide medium:inset-bs-badge-inset-wide medium:px-badge-inline-wide medium:py-badge-block-wide large:inset-s-sm large:inset-bs-sm"
  />
{/if}
