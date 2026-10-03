<script lang="ts">
  import type { LibrarySeries } from "$lib/ipc/bindings";
  import { m } from "$lib/paraglide/messages.js";

  import type { CoverUrl } from "./cover-url";

  let {
    series,
    coverUrl,
  }: { series: readonly LibrarySeries[]; coverUrl: CoverUrl } = $props();
</script>

<ul
  aria-label={m.library_series_list()}
  class="grid grid-cols-3 gap-cover-gap medium:grid-cols-5 medium:gap-cover-gap-wide large:grid-cols-6 large:gap-xl"
>
  {#each series as one, index (index)}
    <li class="flex flex-col gap-cover-caption min-inline-none">
      <div
        class="aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
      >
        {#if one.cover !== null}
          <img
            src={coverUrl(one.cover)}
            alt=""
            loading="lazy"
            decoding="async"
            class="object-cover block-full inline-full"
          />
        {/if}
      </div>
      <div class="min-inline-none">
        <p
          class="truncate text-cover-title font-semibold medium:text-cover-title-wide"
        >
          {one.title}
        </p>
        <p class="mbs-2xs text-caption text-muted">
          {m.library_series_books({ count: one.bookCount })}
        </p>
      </div>
    </li>
  {/each}
</ul>
