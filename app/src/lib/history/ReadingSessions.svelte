<script lang="ts">
  import { getTimeFormatSetting } from "#lib/general/time-format.svelte.ts";
  import { Play, RotateCcw } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { BUTTON_LOOKS } from "#lib/components/ui/button/looks.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { dayFormats, dayName } from "#lib/history/day-name.ts";
  import { historyList } from "#lib/history/history-list.svelte.ts";
  import {
    deviceLocale,
    firstDayOfWeek,
    localDayOf,
    weekStartOf,
  } from "#lib/history/local-date.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import SessionProgress from "#lib/history/SessionProgress.svelte";
  import { startedAtFormats, startedAtTime } from "#lib/history/started-at.ts";
  import {
    type BookSessions,
    commands,
    type HistoryEntry,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import {
    realLook,
    type ShownCover,
    standInLook,
  } from "#lib/library/series-look.ts";
  import { whenInView } from "#lib/paging/in-view.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import type { BookId } from "#lib/reader/opened-book.ts";
  import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

  const ACTION_ICON_SIZE = 14;

  let { book, usesStandIns }: { book: BookId; usesStandIns: boolean } =
    $props();

  const sessions = untrack(() => historyList(() => ({ kind: "book", book })));
  const headingId = $props.id();
  const locale = getLocale();
  const dayNames = dayFormats(locale);
  const timeFormat = getTimeFormatSetting();
  const startTimes = $derived(startedAtFormats(locale, timeFormat.hourCycle));
  const counts = new Intl.NumberFormat(locale);
  const today = localDayOf(new Date());
  const calendar = {
    today,
    weekStart: weekStartOf(today, firstDayOfWeek(deviceLocale())),
  };
  let summed = $state<BookSessions | null>(null);

  const listed = $derived(
    sessions.list.kind === "loaded" ? sessions.list.items[0] : undefined,
  );
  const latest = $derived(
    listed !== undefined && usesStandIns ? standInHistoryEntry(listed) : listed,
  );

  const stats = $derived(
    summed === null
      ? []
      : [
          {
            term: m.history_time_read(),
            value: readingTime(summed.readSeconds),
          },
          {
            term: m.history_session_count(),
            value: counts.format(summed.sessions),
          },
          {
            term: m.history_first_opened(),
            value: dayName(summed.firstDay, calendar, dayNames),
          },
          {
            term: m.history_last_read(),
            value: dayName(summed.lastDay, calendar, dayNames),
          },
        ],
  );

  function coverOf(entry: HistoryEntry): ShownCover {
    return (usesStandIns ? standInLook : realLook)({
      id: entry.series,
      title: entry.seriesTitle,
      cover: entry.cover,
    }).cover;
  }

  function reached(entry: HistoryEntry): string {
    return entry.readTo.state === "page"
      ? m.history_reached_page({ page: entry.readTo.page })
      : m.history_reached_end();
  }

  onMount(() => {
    void sessions.start();
    void commands.bookSessions(book).then((read) => {
      if (read.status === "ok") {
        summed = read.data;
      }
    });
  });
</script>

<div class="flex flex-1 flex-col gap-lg overflow-y-auto min-block-none">
  {#if sessions.list.kind === "failed"}
    <p class="text-muted">{m.history_failed()}</p>
  {/if}
  {#if latest !== undefined}
    <Card class="flex gap-md p-md">
      <ListCover
        cover={coverOf(latest)}
        {coverUrl}
        class="rounded-history-cover inline-history-sessions-cover"
      />
      <div class="flex flex-1 flex-col gap-2xs min-inline-none">
        <p class="line-clamp-2 text-lead font-bold">{latest.seriesTitle}</p>
        <p class="truncate text-detail text-muted">{latest.bookTitle}</p>
        <div
          class="mbs-auto flex items-center gap-sm text-caption text-muted tabular-nums"
        >
          <SessionProgress readTo={latest.readTo} bar="flex-1" />
        </div>
      </div>
    </Card>
  {/if}
  {#if stats.length > 0}
    <dl class="grid grid-cols-2 gap-sm">
      {#each stats as stat (stat.term)}
        <div
          class="flex flex-col gap-2xs rounded-card border border-border bg-card px-md py-sm"
        >
          <dt class="text-caption font-semibold text-muted">{stat.term}</dt>
          <dd class="text-body font-bold tabular-nums">{stat.value}</dd>
        </div>
      {/each}
    </dl>
  {/if}
  {#if sessions.list.kind === "loaded"}
    <div class="flex flex-col gap-xs">
      <h2 id={headingId} class="px-xs text-detail font-bold">
        {m.history_sessions()}
      </h2>
      <ol
        aria-labelledby={headingId}
        class="divide-y divide-border overflow-hidden rounded-card border border-border bg-card"
      >
        {#each sessions.list.items as session (session.startedAtMs)}
          <li class="flex items-center gap-md px-md py-sm">
            <span class="flex flex-1 flex-col min-inline-none">
              <span class="text-detail font-semibold">
                {dayName(session.day.day, calendar, dayNames)}
              </span>
              <span class="text-caption text-muted tabular-nums">
                {m.history_time_and_length({
                  time: startedAtTime(session, startTimes),
                  duration: readingTime(session.readSeconds),
                })}
              </span>
            </span>
            <span
              class="text-detail font-semibold whitespace-nowrap tabular-nums"
            >
              {reached(session)}
            </span>
          </li>
        {/each}
      </ol>
      {#if !sessions.list.isComplete}
        {#key sessions.list.items.length}
          <div
            aria-hidden="true"
            class="block-2xs"
            {@attach whenInView(() => {
              void sessions.loadMore();
            })}
          ></div>
        {/key}
      {/if}
    </div>
  {/if}
</div>
{#if latest !== undefined}
  <div class="flex items-center gap-sm">
    <a
      href={resolve("/(app)/series/[id]", { id: latest.series })}
      class={cn(
        BUTTON_LOOKS.outline,
        "flex items-center justify-center px-lg text-small min-block-dialog-button hover:tint-hover active:tint-pressed touch:min-block-touch-target",
      )}
    >
      {m.history_open_series()}
    </a>
    <a
      href={resolve("/read/[book]", { book })}
      class={cn(
        BUTTON_LOOKS.primary,
        "flex flex-1 items-center justify-center gap-sm rounded-control px-lg text-small font-bold min-block-dialog-button touch:min-block-touch-target",
      )}
    >
      {#if latest.reading.state === "read"}
        <RotateCcw size={ACTION_ICON_SIZE} aria-hidden="true" />
        {m.history_read_again()}
      {:else}
        <Play size={ACTION_ICON_SIZE} aria-hidden="true" fill="currentColor" />
        {m.history_continue()}
      {/if}
    </a>
  </div>
{/if}
