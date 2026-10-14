<script lang="ts">
  import { coverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";

  let { cover }: { cover: ShownCover } = $props();
</script>

<div
  data-series-band
  aria-hidden="true"
  class="absolute inset-s-none inset-bs-none z-series-band overflow-hidden bg-chip block-series-band inline-full expanded:series-band-fade-across expanded:block-series-band-wide expanded:inline-series-band-across"
>
  {#if cover.kind === "picture"}
    <img
      src={coverUrl(cover.path)}
      alt=""
      decoding="async"
      class="scale-125 object-cover blur-series-band block-full inline-full"
    />
  {/if}
  <div
    class="absolute inset-none bg-linear-to-b from-transparent from-30% to-background"
  ></div>
</div>
