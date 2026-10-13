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
  import WeekCards from "#lib/history/WeekCards.svelte";
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

<CollectionHeading
  title={m.history_title()}
  showsLabel={screenshotMode.showsLabel}
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
  <div
    class="mbs-lg flex flex-col gap-lg large:mbs-history-section large:gap-history-section"
  >
    {#if weekTotals.thisWeek !== undefined}
      <WeekCards week={weekTotals.thisWeek} />
    {/if}
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
