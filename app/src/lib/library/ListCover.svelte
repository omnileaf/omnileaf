<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import CoverImage from "#lib/library/CoverImage.svelte";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";

  let {
    cover,
    coverUrl,
    class: look,
    isBlurred = false,
  }: {
    cover: ShownCover;
    coverUrl: CoverUrl;
    class: ClassValue;
    isBlurred?: boolean;
  } = $props();
</script>

<span
  class={[
    "relative box-content block aspect-cover shrink-0 overflow-hidden border border-cover-edge bg-chip",
    look,
  ]}
>
  <CoverImage {cover} {coverUrl} {isBlurred} />
</span>
