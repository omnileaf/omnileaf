<script lang="ts">
  import { cn } from "#lib/components/cn.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  import { seriesBandLook } from "./series-band-look.ts";

  let { cover }: { cover: ShownCover } = $props();

  const look = seriesBandLook(currentPlatform());
</script>

<div
  data-series-band
  aria-hidden="true"
  class={cn(
    "absolute inset-s-none inset-bs-none z-series-band overflow-hidden bg-chip block-series-band inline-full expanded:series-band-fade-across expanded:block-series-band-wide expanded:inline-series-band-across",
    look.band,
  )}
>
  {#if cover.kind === "picture"}
    <img
      src={coverUrl(cover.path)}
      alt=""
      decoding="async"
      class={cn(
        "scale-125 object-cover blur-series-band block-full inline-full",
        look.picture,
      )}
    />
  {/if}
  <div
    class={cn(
      "absolute inset-none bg-linear-to-b from-transparent from-30% to-background grouped:to-native-grouped-ground",
      look.fade,
    )}
  ></div>
</div>
