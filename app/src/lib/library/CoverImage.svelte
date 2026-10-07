<script lang="ts">
  import type { LibrarySeries } from "$lib/ipc/bindings";

  import type { CoverUrl } from "./cover-url";

  let {
    cover,
    coverUrl,
  }: { cover: LibrarySeries["cover"]; coverUrl: CoverUrl } = $props();
</script>

{#if cover !== null}
  <img
    src={coverUrl(cover)}
    alt=""
    loading="lazy"
    decoding="async"
    class="absolute inset-none object-cover block-full inline-full"
  />
{/if}
