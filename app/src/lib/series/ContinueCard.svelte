<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import type { SeriesBook, SeriesOverview } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getSmartFeatures } from "#lib/reader/smart-features.svelte.ts";

  import ContinueLink from "./ContinueLink.svelte";

  let { overview, isWide }: { overview: SeriesOverview; isWide: boolean } =
    $props();

  const smartFeatures = getSmartFeatures();
  const titleId = $props.id();
  const countId = `${titleId}-count`;
  const next = $derived(
    overview.upNext?.reading.state === "read" ? null : overview.upNext,
  );

  function heading(book: SeriesBook | null): string {
    if (book === null) {
      return m.series_all_read();
    }
    return book.reading.state === "started"
      ? m.series_card_continue()
      : m.series_card_up_next();
  }

  function withTimeLeft(place: string): string {
    return overview.secondsLeft === null || !smartFeatures.showsTimeLeft
      ? place
      : m.series_time_left({
          where: place,
          time: readingTime(overview.secondsLeft),
        });
  }

  function where(book: SeriesBook | null): string {
    if (book === null) {
      return m.series_all_read_body();
    }
    const { title, reading, pageCount } = book;
    if (reading.state === "started") {
      if (reading.page === null) {
        return title;
      }
      return pageCount === null
        ? m.series_continue_where_unknown({ title, page: reading.page })
        : m.series_continue_where({
            title,
            page: reading.page,
            pages: pageCount,
          });
    }
    return pageCount === null
      ? m.series_up_next_where_unknown({ title })
      : m.series_up_next_where({ title, pages: pageCount });
  }
</script>

<Card
  role="region"
  aria-labelledby={titleId}
  class="flex flex-col gap-lg py-series-card shadow-card-rest expanded:py-xl"
>
  <CardHeader class="px-series-card expanded:px-xl">
    <CardTitle id={titleId} class="text-body expanded:text-title">
      {heading(next)}
    </CardTitle>
    <CardDescription>
      {next === null ? where(next) : withTimeLeft(where(next))}
    </CardDescription>
  </CardHeader>
  <CardContent
    class="flex flex-col gap-sm px-series-card expanded:flex-row expanded:flex-wrap expanded:items-center expanded:gap-md expanded:px-xl"
  >
    <Progress
      aria-labelledby={countId}
      max={overview.bookCount}
      value={overview.readCount}
      class="expanded:flex-1 expanded:basis-series-card-progress expanded:min-inline-series-card-progress"
    />
    <p id={countId} class="text-small text-nowrap text-muted tabular-nums">
      {m.series_read_count({
        read: overview.readCount,
        total: overview.bookCount,
      })}
    </p>
    {#if next !== null && isWide}
      <ContinueLink book={next} />
    {/if}
  </CardContent>
  {#if next !== null && !isWide}
    <CardFooter class="px-series-card">
      <ContinueLink book={next} class="flex-1" />
    </CardFooter>
  {/if}
</Card>
