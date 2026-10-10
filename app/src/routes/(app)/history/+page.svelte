<script lang="ts">
  import { RotateCcwClock } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { lastWeekDays } from "#lib/history/history-days.ts";
  import HistoryDays from "#lib/history/HistoryDays.svelte";
  import { historyList } from "#lib/history/history-list.svelte.ts";
  import {
    deviceLocale,
    firstDayOfWeek,
    localDayOf,
    weekStartOf,
  } from "#lib/history/local-date.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import { commands } from "#lib/ipc/bindings.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  const screenshotMode = getScreenshotMode();
  const history = historyList();
  let today = $state(localDayOf(new Date()));
  let readThisWeekSeconds: number | undefined = $state();
  let readLastWeekSeconds: number | undefined = $state();

  const calendar = $derived({
    today,
    weekStart: weekStartOf(today, firstDayOfWeek(deviceLocale())),
  });

  const hasEntries = $derived(
    history.list.kind === "loaded" && history.list.items.length > 0,
  );

  async function readThisWeek(): Promise<void> {
    const read = await commands.readingTimeSince(calendar.weekStart);
    if (read.status === "error") {
      reportError(read.error);
      return;
    }
    readThisWeekSeconds = read.data;
  }

  async function readLastWeek(): Promise<void> {
    const { first, last } = lastWeekDays(calendar);
    const read = await commands.readingTimeBetween(first, last);
    if (read.status === "error") {
      reportError(read.error);
      return;
    }
    readLastWeekSeconds = read.data;
  }

  function readAgain(): void {
    today = localDayOf(new Date());
    void history.load();
    void readThisWeek();
    void readLastWeek();
  }

  onMount(() => {
    void history.start();
    void readThisWeek();
    void readLastWeek();
    return listenForLibraryChanges(readAgain, reportError);
  });
</script>

{#snippet readThisWeekTotal()}
  <p class="text-small text-muted large:ms-xs">
    {m.history_read_this_week({
      duration: readingTime(readThisWeekSeconds ?? 0),
    })}
  </p>
{/snippet}

<CollectionHeading
  title={m.history_title()}
  showsLabel={screenshotMode.showsLabel}
  count={hasEntries &&
  readThisWeekSeconds !== undefined &&
  readThisWeekSeconds > 0
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
      lastWeekReadSeconds={readLastWeekSeconds}
      usesStandIns={screenshotMode.isOn}
      onNearEnd={() => {
        void history.loadMore();
      }}
    />
  </div>
{/if}
