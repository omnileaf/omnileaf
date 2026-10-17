<script lang="ts">
  import { Bookmark } from "@lucide/svelte";

  import { Badge } from "#lib/components/ui/badge/index.ts";
  import type { SeriesBook } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 14;

  let { book }: { book: SeriesBook } = $props();
</script>

{#if book.isBookmarked}
  <Bookmark
    size={ICON_SIZE}
    fill="currentColor"
    role="img"
    aria-label={m.series_book_bookmarked()}
    class="shrink-0 text-foreground"
  />
{/if}
{#if book.isNew}
  <Badge look="secondary">{m.series_book_new()}</Badge>
{/if}
