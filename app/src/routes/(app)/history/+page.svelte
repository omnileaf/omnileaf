<script lang="ts">
  import { RotateCcwClock, X } from "@lucide/svelte";
  import { Dialog } from "bits-ui";
  import { onMount } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { DialogTitle } from "#lib/components/ui/dialog/index.ts";
  import { SheetContent } from "#lib/components/ui/sheet/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import HistoryDays from "#lib/history/HistoryDays.svelte";
  import { historyList } from "#lib/history/history-list.svelte.ts";
  import HistorySeriesSelect from "#lib/history/HistorySeriesSelect.svelte";
  import ReadingSessions from "#lib/history/ReadingSessions.svelte";
  import {
    deviceLocale,
    firstDayOfWeek,
    localDayOf,
    weekStartOf,
  } from "#lib/history/local-date.ts";
  import WeekCards from "#lib/history/WeekCards.svelte";
  import { WeekTotals } from "#lib/history/week-totals.svelte.ts";
  import {
    commands,
    type HistoryEntry,
    type HistorySeries,
  } from "#lib/ipc/bindings.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import EmptyState from "#lib/page/EmptyState.svelte";
  import HeaderBadge from "#lib/page/HeaderBadge.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import CollectionHeading from "#lib/screenshot-mode/CollectionHeading.svelte";
  import type { BookId } from "#lib/reader/opened-book.ts";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";

  const CLOSE_ICON_SIZE = 17;

  const screenshotMode = getScreenshotMode();
  let shownSeries: HistorySeries["id"] | undefined = $state();
  let seriesRead: readonly HistorySeries[] = $state([]);
  const history = historyList(() =>
    shownSeries === undefined
      ? { kind: "everything" }
      : { kind: "series", series: shownSeries },
  );
  let today = $state(localDayOf(new Date()));
  let sessionsOf: BookId | undefined = $state();
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

  async function readSeries(): Promise<void> {
    const read = await commands.historySeries();
    if (read.status === "error") {
      reportError(read.error);
      return;
    }
    seriesRead = read.data;
    if (!read.data.some(({ id }) => id === shownSeries)) {
      shownSeries = undefined;
    }
  }

  function readAgain(): void {
    today = localDayOf(new Date());
    void history.load();
    void weekTotals.read(calendar);
    void readSeries();
  }

  onMount(() => {
    void history.start();
    void weekTotals.read(calendar);
    void readSeries();
    return listenForLibraryChanges(readAgain, reportError);
  });
</script>

{#snippet seriesFilter()}
  {#if seriesRead.length > 1}
    <HistorySeriesSelect
      series={seriesRead}
      chosen={shownSeries}
      usesStandIns={screenshotMode.isOn}
      onChoose={(series: HistorySeries["id"] | undefined) => {
        shownSeries = series;
        void history.start();
      }}
    />
  {/if}
{/snippet}

<CollectionHeading
  title={m.history_title()}
  showsLabel={screenshotMode.showsLabel}
  actions={seriesFilter}
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
      onOpenSessions={(entry: HistoryEntry) => {
        sessionsOf = entry.book;
      }}
    />
  </div>
{/if}

<Dialog.Root
  open={sessionsOf !== undefined}
  onOpenChange={(isOpen) => {
    if (!isOpen) {
      sessionsOf = undefined;
    }
  }}
>
  <SheetContent class="gap-lg px-xl pbs-lg pbe-lg inline-history-sheet">
    <div class="flex items-center gap-md">
      <HeaderBadge icon={RotateCcwClock} look="header-accent" />
      <DialogTitle class="flex-1 truncate text-panel-title font-bold">
        {m.history_reading_sessions()}
      </DialogTitle>
      <Tooltip
        label={m.history_close()}
        aria-label={m.history_close()}
        onclick={() => {
          sessionsOf = undefined;
        }}
      >
        {#snippet child({ props })}
          <Button
            {...props}
            look="icon"
            class="rounded-badge text-muted block-panel-button inline-panel-button hover:bg-hover"
          >
            <X size={CLOSE_ICON_SIZE} aria-hidden="true" />
          </Button>
        {/snippet}
      </Tooltip>
    </div>
    {#if sessionsOf !== undefined}
      {#key sessionsOf}
        <ReadingSessions book={sessionsOf} usesStandIns={screenshotMode.isOn} />
      {/key}
    {/if}
  </SheetContent>
</Dialog.Root>
