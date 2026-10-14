<script lang="ts">
  import { resolve } from "$app/paths";
  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

  let {
    entry: listed,
    time,
    usesStandIns,
  }: { entry: HistoryEntry; time: string; usesStandIns: boolean } = $props();

  const entry = $derived(usesStandIns ? standInHistoryEntry(listed) : listed);

  const href = $derived(resolve("/read/[book]", { book: entry.book }));
  const cover = $derived(
    (usesStandIns ? standInLook : realLook)({
      id: listed.series,
      title: listed.seriesTitle,
      cover: listed.cover,
    }).cover,
  );
  const readFor = $derived(readingTime(entry.readSeconds));
  const readTo = $derived(
    entry.readTo.state === "page"
      ? m.history_read_to_page({
          book: entry.bookTitle,
          page: entry.readTo.page,
          count: entry.readTo.pageCount,
        })
      : m.history_read_to_end({ book: entry.bookTitle }),
  );
  const named = $derived({ series: entry.seriesTitle, book: entry.bookTitle });
  const action = $derived(
    entry.reading.state === "read"
      ? {
          text: m.history_read_again(),
          label: m.history_read_again_label(named),
        }
      : { text: m.history_continue(), label: m.history_continue_label(named) },
  );
</script>

<li
  class="desktop:large:flex desktop:large:items-center desktop:large:border-be desktop:large:border-border desktop:large:min-block-history-row-wide"
>
  <Item look="history-phone">
    {#snippet child({ props })}
      <a {href} {...props}>
        <ListCover
          {cover}
          {coverUrl}
          class="rounded-history-cover inline-list-cover"
        />
        <ItemContent class="gap-2xs min-inline-none">
          <ItemTitle class="truncate text-body">{entry.seriesTitle}</ItemTitle>
          <span class="text-small">{readTo}</span>
          <ItemDescription class="text-detail">
            {m.history_started_and_read_for({ time, duration: readFor })}
          </ItemDescription>
        </ItemContent>
      </a>
    {/snippet}
  </Item>
  <Item look="history-desktop">
    <ListCover
      {cover}
      {coverUrl}
      class="rounded-list-cover inline-history-cover-wide"
    />
    <ItemContent class="gap-2xs min-inline-none">
      <ItemTitle class="truncate text-lead">{entry.seriesTitle}</ItemTitle>
      <ItemDescription class="text-detail">{readTo}</ItemDescription>
    </ItemContent>
    <span
      class="shrink-0 text-detail whitespace-nowrap text-muted min-inline-history-time"
    >
      <span class="sr-only">{m.history_started_at({ time })}</span>
      <span aria-hidden="true">{time}</span>
    </span>
    <span
      class="shrink-0 text-detail whitespace-nowrap text-muted min-inline-history-length"
    >
      {m.history_read_for({ duration: readFor })}
    </span>
    <a
      {href}
      aria-label={action.label}
      class="flex shrink-0 items-center justify-center rounded-small-control border border-field bg-card px-md text-small font-semibold whitespace-nowrap min-block-pointer-button min-inline-history-action hover:tint-hover active:tint-pressed"
    >
      {action.text}
    </a>
  </Item>
</li>
