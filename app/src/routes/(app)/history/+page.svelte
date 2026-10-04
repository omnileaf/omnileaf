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
  import { commands } from "#lib/ipc/bindings.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  const screenshotMode = getScreenshotMode();
  const history = historyList();
  const today = localDayOf(new Date());

  let readThisWeekSeconds: number | undefined = $state();

  const hasEntries = $derived(
    history.list.kind === "loaded" && history.list.items.length > 0,
  );

  async function readThisWeek(): Promise<void> {
    const firstDay = weekStartOf(today, firstDayOfWeek(deviceLocale()));
    const read = await commands.readingTimeSince(firstDay);
    if (read.status === "error") {
      reportError(read.error);
      return;
    }
    readThisWeekSeconds = read.data;
  }

  function readAgain(): void {
    void history.load();
    void readThisWeek();
  }

  onMount(() => {
    void history.start();
    void readThisWeek();
    return listenForLibraryChanges(readAgain, reportError);
  });
</script>

{#snippet readThisWeekTotal()}
  <p class="text-small text-muted">
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
  <div class="mbs-lg large:mbs-xl">
    <HistoryDays
      entries={history.list.items}
      isComplete={history.list.isComplete}
      {today}
      onNearEnd={() => {
        void history.loadMore();
      }}
    />
  </div>
{/if}
