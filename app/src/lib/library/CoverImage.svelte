<script lang="ts">
  import type { CoverUrl } from "./cover-url";
  import type { ShownCover } from "./series-look";

  let { cover, coverUrl }: { cover: ShownCover; coverUrl: CoverUrl } = $props();
</script>

{#if cover.kind === "picture"}
  <img
    src={coverUrl(cover.path)}
    alt=""
    loading="lazy"
    decoding="async"
    class="absolute inset-none object-cover block-full inline-full"
  />
{:else if cover.kind === "standIn"}
  <div aria-hidden="true" class="absolute inset-none bg-stand-in-pattern"></div>
{/if}
