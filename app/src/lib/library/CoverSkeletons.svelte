<script lang="ts">
  import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
  import {
    type CoversPerRow,
    DEFAULT_LIBRARY_VIEW,
  } from "#lib/ipc/bindings.ts";
  import { currentPlatform } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { coverLook } from "./cover-look";
  import { coverSkeletonLook } from "./cover-skeleton";
  import { SCREEN_SIZES } from "./library-view";

  const ROWS = 3;

  let {
    coversPerRow = DEFAULT_LIBRARY_VIEW.coversPerRow,
    showsCount = true,
  }: { coversPerRow?: CoversPerRow; showsCount?: boolean } = $props();

  const look = $derived(coverLook(coversPerRow));
  const captions = coverSkeletonLook(currentPlatform());
  const style = $derived(
    SCREEN_SIZES.map(
      (size) => `--${size}-covers-per-row: ${String(coversPerRow[size])}`,
    ).join("; "),
  );
  const count = $derived(
    Math.max(coversPerRow.phone, coversPerRow.tablet, coversPerRow.desktop) *
      ROWS,
  );
</script>

<div
  role="status"
  aria-busy="true"
  aria-label={m.library_loading()}
  class={["grid grid-cols-covers-per-row", look.gap]}
  {style}
>
  {#each { length: count }, index (index)}
    <div class={captions.tile}>
      <Skeleton class="aspect-cover rounded-cover" />
      <div class={captions.caption}>
        <Skeleton class={[captions.title, "inline-4/5"]} />
        {#if showsCount}
          <Skeleton class={[captions.meta, "inline-9/20"]} />
        {/if}
      </div>
    </div>
  {/each}
</div>
