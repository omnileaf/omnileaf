<script lang="ts">
  import { resolve } from "$app/paths";
  import type { SeriesOverview, SeriesVolume } from "#lib/ipc/bindings.ts";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  import AboutCover from "./AboutCover.svelte";
  import {
    ABOUT_COLUMN,
    ABOUT_HEAD,
    ABOUT_LINES,
    ABOUT_META,
    ABOUT_TITLE,
  } from "./series-about-layout.ts";
  import SeriesFolderLine from "./SeriesFolderLine.svelte";

  const SERIES_LINK =
    "rounded-link underline underline-offset-3 text-native-on-button-plain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent touch:touch-target-around";

  let {
    series,
    volume,
    cover,
    coverUrl,
  }: {
    series: SeriesOverview;
    volume: SeriesVolume;
    cover: ShownCover;
    coverUrl: CoverUrl;
  } = $props();

  const title = $derived(m.series_volume({ number: volume.volume }));
  const chapters = $derived(
    m.series_chapter_count({ count: volume.bookCount }),
  );
  const counts = $derived(
    volume.pageCount === null
      ? m.series_volume_counts({ chapters })
      : m.series_volume_counts_pages({
          chapters,
          pages: m.series_page_count({ count: volume.pageCount }),
        }),
  );
  const folder = $derived(
    series.folder === null || volume.folder === null
      ? series.folder
      : m.series_volume_folder({
          series: series.folder,
          volume: volume.folder,
        }),
  );
</script>

<section aria-label={m.series_volume_about()} class={ABOUT_COLUMN}>
  <div class={ABOUT_HEAD}>
    <AboutCover {title} {cover} {coverUrl} />
    <div class={ABOUT_LINES}>
      <h1 tabindex="-1" class={ABOUT_TITLE}>{title}</h1>
      <p class={ABOUT_META}>
        <a
          href={resolve("/(app)/series/[id]", { id: series.id })}
          class={SERIES_LINK}
        >
          {series.title}
        </a>
      </p>
      <p class={ABOUT_META}>{counts}</p>
      {#if folder !== null}
        <SeriesFolderLine {folder} />
      {/if}
    </div>
  </div>
</section>
