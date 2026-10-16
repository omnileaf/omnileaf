<script lang="ts">
  import { MediaQuery, SvelteSet } from "svelte/reactivity";

  import { resolve } from "$app/paths";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import type {
    AdultTreatment,
    RelatedReason,
    RelatedSeries,
  } from "#lib/ipc/bindings.ts";
  import AdultVeil from "#lib/library/AdultVeil.svelte";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { shownRelated } from "./related-shown.ts";

  let {
    related,
    usesStandIns,
    adultTreatment,
  }: {
    related: readonly RelatedSeries[];
    usesStandIns: boolean;
    adultTreatment: AdultTreatment;
  } = $props();

  const headingId = $props.id();
  const look = $derived(usesStandIns ? standInLook : realLook);
  const shown = $derived(
    shownRelated(related, { adultTreatment, usesStandIns }),
  );
  const canHover = new MediaQuery("(hover: hover)");
  const revealed = new SvelteSet<RelatedSeries["id"]>();

  function isVeiled(series: RelatedSeries): boolean {
    return (
      adultTreatment === "blur" && series.isAdult && !revealed.has(series.id)
    );
  }

  function revealing(series: RelatedSeries, title: string) {
    return isVeiled(series)
      ? {
          role: "button",
          "aria-label": m.library_show_adult_cover({ title }),
          onclick: (event: MouseEvent) => {
            event.preventDefault();
            revealed.add(series.id);
          },
        }
      : {};
  }
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
        return usesStandIns ? m.series_related_tag() : reason.tag;
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

{#if shown.length > 0}
  <section aria-labelledby={headingId} class="flex flex-col gap-md">
    <h2 id={headingId} class="text-group-title font-semibold">
      {m.series_related()}
    </h2>
    <ul
      class="grid grid-cols-3 gap-md expanded:flex expanded:flex-wrap expanded:gap-xl"
    >
      {#each shown as series (series.id)}
        {@const named = look(series)}
        {@const veiled = isVeiled(series)}
        <li class="@container min-inline-none expanded:inline-related-cover">
          <a
            href={resolve("/(app)/series/[id]", { id: series.id })}
            class="flex flex-col gap-icon-gap"
            {...revealing(series, named.title)}
          >
            <span
              class="relative aspect-cover overflow-hidden rounded-cover border border-cover-edge bg-chip"
            >
              <CoverImage cover={named.cover} {coverUrl} isBlurred={veiled} />
              {#if veiled}
                <AdultVeil onPointer={canHover.current} />
              {/if}
            </span>
            <span class="truncate text-small font-medium">{named.title}</span>
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
