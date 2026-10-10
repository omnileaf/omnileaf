<script lang="ts">
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
  }: {
    entries: readonly HistoryEntry[];
    isComplete: boolean;
    calendar: HistoryCalendar;
    lastWeekReadSeconds: number | undefined;
    usesStandIns: boolean;
    onNearEnd: () => void;
  } = $props();

  const locale = getLocale();
  const dayNames = dayFormats(locale);
  const startTimes = startedAtFormats(locale);
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

<div
  class="flex flex-col gap-history-days large:gap-history-days-wide touch:max-medium:px-xs"
>
  {#each days as day, index (historyDayKey(day.title))}
    <section aria-labelledby={`${headingId}-${String(index)}`}>
      <h2
        id={`${headingId}-${String(index)}`}
        class="mbe-2xs flex items-baseline justify-between gap-sm text-lead font-bold large:justify-start large:text-small"
      >
        <span>{nameOf(day.title)}</span>
        <span class="text-detail font-regular text-muted large:font-medium">
          {readingTime(day.readSeconds)}
        </span>
      </h2>
      <ul>
        {#each day.entries as entry (`${entry.book}-${String(entry.startedAtMs)}`)}
          <HistoryRow {entry} time={timeOf(day.title, entry)} {usesStandIns} />
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
