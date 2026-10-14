<script lang="ts">
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ROWS = 3;
</script>

<div
  role="status"
  aria-label={m.series_loading()}
  class="flex flex-col gap-xl max-expanded:mbs-sm @series-split:flex-row @series-split:items-start @series-split:gap-2xl"
>
  <div
    class="flex flex-col items-center gap-md expanded:items-start @series-split:shrink-0 @series-split:inline-series-aside"
  >
    <Skeleton
      class="aspect-cover rounded-series-cover inline-series-cover expanded:inline-series-cover-wide"
    />
    <Skeleton class="block-xl inline-skeleton-title" />
    <Skeleton class="block-lg inline-skeleton-line" />
    <Skeleton
      class="mbs-md block-touch-target inline-full expanded:mbs-none expanded:block-pointer-button"
    />
  </div>
  <div class="flex flex-1 flex-col gap-lg min-inline-none">
    <Skeleton
      class="rounded-card block-skeleton-card expanded:block-skeleton-card-wide"
    />
    <Skeleton class="block-touch-target expanded:block-pointer-button" />
    <div class="flex flex-col gap-lg rounded-card border border-border p-lg">
      {#each { length: ROWS }, row (row)}
        <div class="flex flex-col gap-sm">
          <Skeleton class="block-lg inline-skeleton-title" />
          <Skeleton class="block-md inline-skeleton-line" />
        </div>
      {/each}
    </div>
  </div>
</div>
