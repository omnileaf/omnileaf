<script lang="ts">
  import { resolve } from "$app/paths";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import type { RelatedReason, RelatedSeries } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let {
    related,
    usesStandIns,
  }: { related: readonly RelatedSeries[]; usesStandIns: boolean } = $props();

  const headingId = $props.id();
  const look = $derived(usesStandIns ? standInLook : realLook);
  const percent = $derived(
    new Intl.NumberFormat(getLocale(), {
      style: "percent",
      maximumFractionDigits: 0,
      roundingMode: "floor",
    }),
  );

  function why(reason: RelatedReason): string {
    switch (reason.kind) {
      case "sameWriter":
        return m.series_related_writer();
      case "sameArtist":
        return m.series_related_artist();
      case "sharedTag":
        return reason.tag;
    }
  }

  function howFar({ readCount, bookCount }: RelatedSeries): string {
    if (readCount === 0) {
      return m.series_related_not_started();
    }
    return readCount === bookCount
      ? m.series_book_read()
      : m.series_related_progress({
          percent: percent.format(readCount / bookCount),
        });
  }
</script>

{#if related.length > 0}
  <section aria-labelledby={headingId} class="flex flex-col gap-md">
    <h2 id={headingId} class="text-group-title font-semibold">
      {m.series_related()}
    </h2>
    <ul
      class="grid grid-cols-3 gap-md expanded:flex expanded:flex-wrap expanded:gap-xl"
    >
      {#each related as series (series.id)}
        {@const shown = look(series)}
        <li class="min-inline-none expanded:inline-related-cover">
          <a
            href={resolve("/(app)/series/[id]", { id: series.id })}
            class="flex flex-col gap-icon-gap"
          >
            <span
              class="relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
            >
              <CoverImage cover={shown.cover} {coverUrl} />
            </span>
            <span class="truncate text-small font-medium">{shown.title}</span>
            <span
              class="flex flex-col items-start gap-xs expanded:flex-row expanded:items-center expanded:gap-sm"
            >
              <Badge look="secondary" class="max-inline-full">
                <span class="truncate">{why(series.reason)}</span>
              </Badge>
              <span class="text-caption text-muted">{howFar(series)}</span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}
