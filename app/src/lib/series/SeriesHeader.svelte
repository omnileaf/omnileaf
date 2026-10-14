<script lang="ts">
  import { Folder } from "@lucide/svelte";

  import type { SeriesOverview } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  const FOLDER_ICON_SIZE = 14;

  let {
    overview,
    cover,
    coverUrl,
  }: { overview: SeriesOverview; cover: ShownCover; coverUrl: CoverUrl } =
    $props();
</script>

<div class="flex items-end gap-lg medium:gap-xl expanded:gap-lg">
  <div
    class="relative aspect-cover shrink-0 overflow-hidden rounded-series-cover border border-series-cover-edge bg-chip shadow-series-cover inline-series-cover medium:inline-series-cover-tablet expanded:inline-series-cover-wide"
  >
    <CoverImage {cover} {coverUrl} />
  </div>
  <div class="flex flex-col gap-xs pbe-xs min-inline-none">
    <h1
      tabindex="-1"
      class="text-series-title font-extrabold wrap-break-word medium:text-series-title-tablet expanded:text-series-title"
    >
      {overview.title}
    </h1>
    <p class="text-detail text-muted">
      {m.library_series_books({ count: overview.bookCount })}
    </p>
    {#if overview.folder !== null}
      <p class="flex items-center gap-icon-gap text-detail text-muted">
        <Folder
          size={FOLDER_ICON_SIZE}
          role="img"
          aria-label={m.series_folder()}
          class="shrink-0"
        />
        <span class="truncate">{overview.folder}</span>
      </p>
    {/if}
  </div>
</div>
