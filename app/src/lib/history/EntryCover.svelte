<script lang="ts">
  import type { ClassValue } from "svelte/elements";

  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";

  let { cover, class: look }: { cover: ShownCover; class: ClassValue } =
    $props();
</script>

<span
  class={[
    "relative box-content aspect-cover shrink-0 overflow-hidden border border-cover-edge bg-chip",
    look,
  ]}
>
  <CoverImage {cover} {coverUrl} />
</span>
