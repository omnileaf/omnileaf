<script lang="ts">
  import type { LibrarySeries } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import { realLook, standInLook } from "#lib/library/series-look.ts";

  let {
    series,
    usesStandIns,
  }: { series: readonly LibrarySeries[]; usesStandIns: boolean } = $props();

  const lookOf = $derived(usesStandIns ? standInLook : realLook);
</script>

<div
  aria-hidden="true"
  class="flex items-end justify-center gap-sm border-be-3 border-border px-sm block-shelf"
>
  {#each series as shown, order (shown.id)}
    <span
      class="flex motion-safe:animate-ready-settle"
      style:--shelf-order={order}
    >
      <ListCover
        cover={lookOf(shown).cover}
        {coverUrl}
        class="rounded-cover inline-shelf-cover"
      />
    </span>
  {/each}
</div>
