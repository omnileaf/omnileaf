<script lang="ts">
  import { RotateCcwClock } from "@lucide/svelte";
  import { onMount } from "svelte";

  import HistoryDays from "#lib/history/HistoryDays.svelte";
  import { historyList } from "#lib/history/history-list.svelte.ts";
  import {
    deviceLocale,
    firstDayOfWeek,
    localDayOf,
    weekStartOf,
  } from "#lib/history/local-date.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import { WeekTotals } from "#lib/history/week-totals.svelte.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  const screenshotMode = getScreenshotMode();
  const history = historyList({ kind: "everything" });
  let today = $state(localDayOf(new Date()));
  const weekTotals = new WeekTotals(
    {
      week: (weekStart, day) => commands.readingWeek(weekStart, day),
      between: (first, last) => commands.readingTimeBetween(first, last),
    },
    (error) => {
      reportError(error);
    },
  );

  const calendar = $derived({
    today,
    weekStart: weekStartOf(today, firstDayOfWeek(deviceLocale())),
  });

  const hasEntries = $derived(
    history.list.kind === "loaded" && history.list.items.length > 0,
  );

  function readAgain(): void {
    today = localDayOf(new Date());
    void history.load();
    void weekTotals.read(calendar);
  }

  onMount(() => {
    void history.start();
    void weekTotals.read(calendar);
    return listenForLibraryChanges(readAgain, reportError);
  });
</script>

{#snippet readThisWeekTotal()}
  <p class="text-small text-muted large:ms-xs">
    {m.history_read_this_week({
      duration: readingTime(weekTotals.thisWeek?.readSeconds ?? 0),
    })}
  </p>
{/snippet}

<CollectionHeading
  title={m.history_title()}
  showsLabel={screenshotMode.showsLabel}
  count={hasEntries &&
  weekTotals.thisWeek !== undefined &&
  weekTotals.thisWeek.readSeconds > 0
    ? readThisWeekTotal
    : undefined}
/>
{#if history.list.kind === "failed"}
  <p class="mbs-sm text-muted">{m.history_failed()}</p>
{:else if history.list.kind === "loaded" && history.list.items.length === 0}
  <EmptyState
    icon={RotateCcwClock}
    title={m.history_empty_title()}
    body={m.history_empty_body()}
  />
{:else if history.list.kind === "loaded"}
  <div class="mbs-lg large:mbs-history-days-wide">
    <HistoryDays
      entries={history.list.items}
      isComplete={history.list.isComplete}
      {calendar}
      lastWeekReadSeconds={weekTotals.lastWeekSeconds}
      usesStandIns={screenshotMode.isOn}
      onNearEnd={() => {
        void history.loadMore();
      }}
    />
  </div>
{/if}
