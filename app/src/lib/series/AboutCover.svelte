<script lang="ts">
  import { BookImage } from "@lucide/svelte";

  import { Icon } from "#lib/components/ui/icon/index.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { ABOUT_COVER } from "./series-about-layout.ts";

  const NO_COVER_ICON_SIZE = 32;

  let {
    title,
    cover,
    coverUrl,
    isDimmed = false,
  }: {
    title: string;
    cover: ShownCover;
    coverUrl: CoverUrl;
    isDimmed?: boolean;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isAndroidPhone = $derived(
    phoneOf(platform, width.current) === "android",
  );
</script>

<div
  role="img"
  aria-label={m.series_cover({ title })}
  class={[
    "relative flex items-center justify-center overflow-hidden rounded-series-cover bg-chip text-muted shadow-native-series-cover",
    ABOUT_COVER,
    isDimmed && "opacity-45",
  ]}
>
  {#if cover.kind === "none" && isAndroidPhone}
    <Icon name="book" />
  {:else if cover.kind === "none"}
    <BookImage size={NO_COVER_ICON_SIZE} aria-hidden="true" />
  {/if}
  <CoverImage {cover} {coverUrl} />
</div>
