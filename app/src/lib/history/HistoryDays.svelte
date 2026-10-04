<script lang="ts">
  import { dayName } from "#lib/history/day-name.ts";
  import { historyDays } from "#lib/history/history-days.ts";
  import HistoryRow from "#lib/history/HistoryRow.svelte";
  import type { LocalDay } from "#lib/history/local-date.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { whenInView } from "#lib/paging/in-view.ts";
  import { getLocale } from "#lib/paraglide/runtime.js";

  let {
    entries,
    isComplete,
    today,
    onNearEnd,
  }: {
    entries: readonly HistoryEntry[];
    isComplete: boolean;
    today: LocalDay;
    onNearEnd: () => void;
  } = $props();

  const locale = getLocale();
  const headingId = $props.id();
  const days = $derived(historyDays(entries));
</script>

<div class="flex flex-col gap-history-days large:gap-history-days-wide">
  {#each days as day, index (`${String(day.day)}-${String(index)}`)}
    <section aria-labelledby={`${headingId}-${String(index)}`}>
      <h2
        id={`${headingId}-${String(index)}`}
        class="mbe-2xs flex items-baseline justify-between gap-sm text-lead font-bold large:justify-start large:text-small"
      >
        <span>{dayName(day.day, today, locale)}</span>
        <span class="text-detail font-regular text-muted large:font-medium">
          {readingTime(day.readSeconds)}
        </span>
      </h2>
      <ul>
        {#each day.entries as entry (`${entry.book}-${String(entry.startedAtMs)}`)}
          <HistoryRow {entry} {locale} />
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
