<script lang="ts">
  import { resolve } from "$app/paths";
  import { readingTime } from "#lib/history/reading-time.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

  let {
    entry: listed,
    time,
    usesStandIns,
  }: { entry: HistoryEntry; time: string; usesStandIns: boolean } = $props();

  const entry = $derived(usesStandIns ? standInHistoryEntry(listed) : listed);

  const href = $derived(resolve("/read/[book]", { book: entry.book }));
  const cover: ShownCover = $derived(
    usesStandIns
      ? { kind: "standIn" }
      : entry.cover === null
        ? { kind: "none" }
        : { kind: "picture", path: entry.cover },
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
  class="large:flex large:items-center large:border-be large:border-border large:min-block-history-row-wide"
>
  <a
    {href}
    class="flex items-center gap-cover-gap min-block-history-row large:hidden"
  >
    <ListCover
      {cover}
      {coverUrl}
      class="rounded-history-cover inline-list-cover"
    />
    <span class="flex flex-1 flex-col gap-2xs min-inline-none">
      <span class="truncate text-body font-semibold">{entry.seriesTitle}</span>
      <span class="text-small">{readTo}</span>
      <span class="text-detail text-muted">
        {m.history_started_and_read_for({ time, duration: readFor })}
      </span>
    </span>
  </a>
  <div class="hidden flex-1 items-center gap-lg large:flex">
    <ListCover
      {cover}
      {coverUrl}
      class="rounded-list-cover inline-history-cover-wide"
    />
    <span class="flex flex-1 flex-col gap-2xs min-inline-none">
      <span class="truncate text-lead font-semibold">{entry.seriesTitle}</span>
      <span class="text-detail text-muted">{readTo}</span>
    </span>
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
      class="flex shrink-0 items-center justify-center rounded-small-control border border-field bg-card text-small font-semibold block-pointer-button inline-history-action hover:tint-hover active:tint-pressed"
    >
      {action.text}
    </a>
  </div>
</li>
