<script lang="ts">
  import type { CoverUrl } from "./cover-url";
  import type { ShownCover } from "./series-look";

  let {
    cover,
    coverUrl,
    isBlurred = false,
  }: { cover: ShownCover; coverUrl: CoverUrl; isBlurred?: boolean } = $props();
</script>

{#if cover.kind === "picture"}
  <img
    src={coverUrl(cover.path)}
    alt=""
    loading="lazy"
    decoding="async"
    class={[
      "absolute inset-none object-cover block-full inline-full",
      isBlurred && "scale-110 blur-glass",
    ]}
  />
{:else if cover.kind === "standIn"}
  <div
    aria-hidden="true"
    class={[
      "absolute inset-none bg-stand-in-pattern",
      isBlurred && "scale-110 blur-glass",
    ]}
  ></div>
{/if}
