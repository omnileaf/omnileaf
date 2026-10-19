<script lang="ts">
  import {
    BookImage,
    ChevronDown,
    ChevronUp,
    Folder,
    Info,
    Pencil,
  } from "@lucide/svelte";
  import { tick } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import {
    Card,
    CardAction,
    CardContent,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from "#lib/components/ui/collapsible/index.ts";
  import type { ReadMark, SeriesOverview } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoonControl from "./ComingSoonControl.svelte";
  import SeriesActions from "./SeriesActions.svelte";
  import { SERIES_CONTROL } from "./series-control.ts";
  import SeriesCredits from "./SeriesCredits.svelte";
  import SeriesDetailsList from "./SeriesDetailsList.svelte";
  import SeriesSummary from "./SeriesSummary.svelte";

  const ICON_SIZE = 16;
  const NO_COVER_ICON_SIZE = 32;

  let {
    overview,
    cover,
    coverUrl,
    isWide,
    onMarkAll,
  }: {
    overview: SeriesOverview;
    cover: ShownCover;
    coverUrl: CoverUrl;
    isWide: boolean;
    onMarkAll: (mark: ReadMark) => Promise<void>;
  } = $props();

  let areDetailsOpen = $state(false);
  let details: HTMLElement | undefined = $state();

  const books = $derived(m.library_series_books({ count: overview.bookCount }));

  async function showAllCreators(): Promise<void> {
    areDetailsOpen = true;
    await tick();
    details?.scrollIntoView({ block: "nearest" });
    details?.focus({ preventScroll: true });
  }
</script>

<section
  aria-label={m.series_about()}
  class="flex flex-col gap-xl expanded:gap-lg @series-split:shrink-0 @series-split:inline-series-aside"
>
  <div
    class="flex flex-col items-center gap-lg text-center expanded:items-start expanded:text-start"
  >
    <div
      role="img"
      aria-label={m.series_cover({ title: overview.title })}
      class="relative flex aspect-cover shrink-0 items-center justify-center overflow-hidden rounded-series-cover bg-chip text-muted shadow-series-cover inline-series-cover expanded:inline-series-cover-wide"
    >
      {#if cover.kind === "none"}
        <BookImage size={NO_COVER_ICON_SIZE} aria-hidden="true" />
      {/if}
      <CoverImage {cover} {coverUrl} />
    </div>
    <div
      class="flex flex-col items-center gap-xs max-inline-full expanded:items-start expanded:gap-icon-gap"
    >
      <h1
        tabindex="-1"
        class="line-clamp-3 text-series-title font-bold tracking-tight text-balance wrap-break-word expanded:text-pretty"
      >
        {overview.title}
      </h1>
      <SeriesCredits
        creators={overview.creators}
        onShowAll={() => {
          void showAllCreators();
        }}
      />
      <p class="text-small text-muted">
        {#if overview.bookCount === 0}
          {m.series_no_books_count()}
        {:else if overview.format === null}
          {books}
        {:else}
          {m.series_format_books({ format: overview.format, books })}
        {/if}
      </p>
      {#if overview.folder !== null}
        <p
          class="flex items-center gap-icon-gap text-small text-muted max-inline-full"
        >
          <Folder
            size={ICON_SIZE}
            role="img"
            aria-label={m.series_folder()}
            class="shrink-0"
          />
          <span class="truncate font-mono text-caption">{overview.folder}</span>
        </p>
      {/if}
    </div>
  </div>
  {#if overview.bookCount > 0}
    <SeriesActions {overview} {isWide} {onMarkAll} />
  {/if}
  {#if overview.bookCount > 0 && overview.summary !== null}
    <SeriesSummary summary={overview.summary} />
  {/if}
  {#if overview.bookCount > 0 && overview.tags.length > 0}
    <ul aria-label={m.series_tags()} class="flex flex-wrap gap-icon-gap">
      {#each overview.tags as tag (tag)}
        <li><Badge look="outline">{tag}</Badge></li>
      {/each}
    </ul>
  {/if}
  {#if overview.bookCount > 0 && isWide}
    <Card
      role="region"
      aria-label={m.series_details()}
      class="flex flex-col gap-md py-lg shadow-card-rest"
    >
      <CardHeader class="px-lg">
        <CardTitle class="text-title">{m.series_details()}</CardTitle>
        <CardAction>
          <ComingSoonControl
            label={m.series_edit_details()}
            class="flex items-center justify-center rounded-shadcn-control block-pointer-target inline-pointer-target"
          >
            <Pencil size={ICON_SIZE} aria-hidden="true" />
          </ComingSoonControl>
        </CardAction>
      </CardHeader>
      <CardContent class="px-lg">
        <SeriesDetailsList {overview} bind:ref={details} />
      </CardContent>
    </Card>
  {:else if overview.bookCount > 0}
    <Collapsible bind:open={areDetailsOpen} class="flex flex-col gap-md">
      <CollapsibleTrigger
        class={cn(SERIES_CONTROL, "justify-between text-foreground")}
      >
        <span class="flex items-center gap-sm">
          <Info size={ICON_SIZE} aria-hidden="true" />
          {m.series_details()}
        </span>
        {#if areDetailsOpen}
          <ChevronUp size={ICON_SIZE} aria-hidden="true" />
        {:else}
          <ChevronDown size={ICON_SIZE} aria-hidden="true" />
        {/if}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card class="p-lg shadow-card-rest">
          <SeriesDetailsList {overview} bind:ref={details} />
        </Card>
      </CollapsibleContent>
    </Collapsible>
  {/if}
</section>
