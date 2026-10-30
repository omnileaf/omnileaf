<script lang="ts">
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ROWS = 3;
  const MACOS_ROWS = 8;

  const isMacos = currentPlatform() === "macos";
</script>

<div
  role="status"
  aria-label={m.series_loading()}
  class="flex flex-col gap-xl max-expanded:mbs-sm @series-split:flex-row @series-split:items-start @series-split:gap-2xl"
>
  {#if isMacos}
    <div
      class="flex flex-col items-start gap-native-series-gap @series-split:shrink-0 @series-split:inline-native-series-aside"
    >
      <Skeleton
        class="aspect-cover rounded-skeleton-macos inline-native-series-cover-wide"
      />
      <Skeleton
        class="rounded-skeleton-macos block-xl inline-skeleton-title-macos"
      />
      <Skeleton
        class="rounded-skeleton-macos block-skeleton-line-macos inline-skeleton-line"
      />
      <Skeleton
        class="mbs-skeleton-lift-macos rounded-skeleton-macos block-xl inline-full"
      />
    </div>
    <div class="flex flex-1 flex-col gap-native-series-gap min-inline-none">
      <Skeleton class="rounded-native-card block-skeleton-card-macos" />
      <Skeleton class="rounded-skeleton-macos block-xl inline-3/5" />
      <div class="flex flex-col">
        {#each { length: MACOS_ROWS }, row (row)}
          <div class="flex items-center gap-lg px-sm block-skeleton-row-macos">
            <Skeleton
              class="shrink-0 rounded-skeleton-macos block-skeleton-check-macos inline-skeleton-check-macos"
            />
            <Skeleton class="rounded-skeleton-macos block-md inline-19/50" />
            <Skeleton
              class="ms-auto shrink-0 rounded-skeleton-macos block-md inline-skeleton-trailing-macos"
            />
          </div>
        {/each}
      </div>
    </div>
  {:else}
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
  {/if}
</div>
