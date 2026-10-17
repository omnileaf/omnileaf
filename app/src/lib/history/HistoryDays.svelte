<script lang="ts">
  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import { dayFormats, dayName } from "#lib/history/day-name.ts";
  import {
    type HistoryCalendar,
    historyDayKey,
    type HistoryDayTitle,
    historyDays,
  } from "#lib/history/history-days.ts";
  import HistoryRow from "#lib/history/HistoryRow.svelte";
  import { readingTime } from "#lib/history/reading-time.ts";
  import {
    startedAtFormats,
    startedAtTime,
    startedAtWeekdayTime,
  } from "#lib/history/started-at.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { whenInView } from "#lib/paging/in-view.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let {
    entries,
    isComplete,
    calendar,
    lastWeekReadSeconds,
    usesStandIns,
    onNearEnd,
    onOpenSessions,
  }: {
    entries: readonly HistoryEntry[];
    isComplete: boolean;
    calendar: HistoryCalendar;
    lastWeekReadSeconds: number | undefined;
    usesStandIns: boolean;
    onNearEnd: () => void;
    onOpenSessions: (entry: HistoryEntry) => void;
  } = $props();

  const locale = getLocale();
  const dayNames = dayFormats(locale);
  const timeFormat = getTimeFormatSetting();
  const startTimes = $derived(startedAtFormats(locale, timeFormat.hourCycle));
  const headingId = $props.id();
  const days = $derived(historyDays(entries, calendar, lastWeekReadSeconds));

  function nameOf(title: HistoryDayTitle): string {
    return title.kind === "lastWeek"
      ? m.history_last_week()
      : dayName(title.day, calendar, dayNames);
  }

  /** Last week gathers several days under one heading, so its times carry their weekday. */
  function timeOf(title: HistoryDayTitle, entry: HistoryEntry): string {
    return title.kind === "lastWeek"
      ? startedAtWeekdayTime(entry, startTimes)
      : startedAtTime(entry, startTimes);
  }
</script>

<div class="flex flex-col gap-history-days touch:max-medium:px-xs">
  <div
    aria-hidden="true"
    class="hidden items-center gap-lg ps-lg pe-md text-caption font-semibold text-muted desktop:large:flex"
  >
    <span class="flex-1 ps-history-book">{m.history_column_book()}</span>
    <span class="min-inline-history-time">{m.history_column_started()}</span>
    <span class="min-inline-history-length">{m.history_column_read_for()}</span>
    <span class="inline-history-progress">{m.history_column_progress()}</span>
    <span class="min-inline-history-actions"></span>
  </div>
  {#each days as day, index (historyDayKey(day.title))}
    <section
      aria-labelledby={`${headingId}-${String(index)}`}
      class="flex flex-col gap-xs desktop:large:gap-none desktop:large:overflow-hidden desktop:large:rounded-card desktop:large:border desktop:large:border-border desktop:large:bg-card desktop:large:shadow-raised"
    >
      <h2
        id={`${headingId}-${String(index)}`}
        class="flex items-baseline gap-sm px-xs text-lead font-bold desktop:large:items-center desktop:large:border-be desktop:large:border-border desktop:large:bg-well desktop:large:px-lg desktop:large:text-detail desktop:large:block-history-day"
      >
        <span class="flex-1">{nameOf(day.title)}</span>
        <span
          class="text-detail font-semibold text-muted tabular-nums desktop:large:text-caption"
        >
          {readingTime(day.readSeconds)}
        </span>
      </h2>
      <ul
        class="divide-y divide-border overflow-hidden rounded-card border border-border bg-card desktop:large:rounded-none desktop:large:border-none"
      >
        {#each day.entries as entry (`${entry.book}-${String(entry.startedAtMs)}`)}
          <HistoryRow
            {entry}
            time={timeOf(day.title, entry)}
            {usesStandIns}
            onOpenSessions={() => {
              onOpenSessions(entry);
            }}
          />
        {/each}
      </ul>
    </section>
  {/each}
  {#if !isComplete}
    {#key entries.length}
      <div
        aria-hidden="true"
        class="block-2xs"
        {@attach whenInView(onNearEnd)}
      ></div>
    {/key}
  {/if}
</div>
