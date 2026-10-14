<script lang="ts">
  import { Play, RotateCcw } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { BUTTON_LOOKS } from "#lib/components/ui/button/looks.ts";
  import {
    Item,
    ItemContent,
    ItemDescription,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import HistoryRowMenu from "#lib/history/HistoryRowMenu.svelte";
  import HistoryRowSheet from "#lib/history/HistoryRowSheet.svelte";
  import SessionProgress from "#lib/history/SessionProgress.svelte";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

  const ACTION_ICON_SIZE = 13;

  let {
    entry: listed,
    time,
    usesStandIns,
    onOpenSessions,
  }: {
    entry: HistoryEntry;
    time: string;
    usesStandIns: boolean;
    onOpenSessions: () => void;
  } = $props();

  const entry = $derived(usesStandIns ? standInHistoryEntry(listed) : listed);

  const href = $derived(resolve("/read/[book]", { book: entry.book }));
  const cover = $derived(
    (usesStandIns ? standInLook : realLook)({
      id: listed.series,
      title: listed.seriesTitle,
      cover: listed.cover,
    }).cover,
  );
  const readFor = $derived(readingTime(entry.readSeconds));
  const named = $derived({ series: entry.seriesTitle, book: entry.bookTitle });
  const action = $derived(
    entry.reading.state === "read"
      ? {
          text: m.history_read_again(),
          label: m.history_read_again_label(named),
          icon: RotateCcw,
        }
      : {
          text: m.history_continue(),
          label: m.history_continue_label(named),
          icon: Play,
        },
  );
</script>

<li
  class="flex items-center desktop:large:relative desktop:large:ps-lg desktop:large:pe-md desktop:large:hover:bg-hover"
>
  <Item look="history-phone">
    {#snippet child({ props })}
      <a {href} {...props}>
        <ListCover
          {cover}
          {coverUrl}
          class="rounded-history-cover inline-history-cover"
        />
        <ItemContent class="gap-2xs min-inline-none">
          <ItemTitle class="truncate text-lead font-semibold">
            {entry.seriesTitle}
          </ItemTitle>
          <ItemDescription class="truncate text-detail">
            {entry.bookTitle}
          </ItemDescription>
          <span
            class="flex items-center gap-sm text-caption text-muted tabular-nums"
          >
            <SessionProgress
              readTo={entry.readTo}
              bar="shrink-0 inline-history-bar"
            />
            <span class="truncate">
              {m.history_time_and_length({ time, duration: readFor })}
            </span>
          </span>
        </ItemContent>
      </a>
    {/snippet}
  </Item>
  <HistoryRowSheet {entry} {cover} />
  <Item look="history-desktop">
    <ListCover
      {cover}
      {coverUrl}
      class="rounded-list-cover inline-history-cover-wide"
    />
    <ItemContent class="min-inline-none">
      <button
        type="button"
        aria-label={m.history_open_sessions(named)}
        class="flex flex-col gap-2xs text-start outline-none min-inline-none before:absolute before:inset-none focus-visible:before:outline-2 focus-visible:before:-outline-offset-2 focus-visible:before:outline-accent"
        onclick={onOpenSessions}
      >
        <ItemTitle class="truncate text-small font-semibold inline-full">
          {entry.seriesTitle}
        </ItemTitle>
        <ItemDescription class="truncate text-detail inline-full">
          {entry.bookTitle}
        </ItemDescription>
      </button>
    </ItemContent>
    <span
      class="shrink-0 text-detail whitespace-nowrap text-muted tabular-nums min-inline-history-time"
    >
      <span class="sr-only">{m.history_started_at({ time })}</span>
      <span aria-hidden="true">{time}</span>
    </span>
    <span
      class="shrink-0 text-detail whitespace-nowrap text-muted tabular-nums min-inline-history-length"
    >
      <span class="sr-only">{m.history_read_for({ duration: readFor })}</span>
      <span aria-hidden="true">{readFor}</span>
    </span>
    <span
      class="flex shrink-0 items-center gap-sm text-caption text-muted tabular-nums inline-history-progress"
    >
      <SessionProgress readTo={entry.readTo} bar="flex-1" />
    </span>
    <span
      class="flex shrink-0 items-center justify-end gap-xs min-inline-history-actions"
    >
      <a
        {href}
        aria-label={action.label}
        class={cn(
          BUTTON_LOOKS.outline,
          "relative flex items-center justify-center gap-icon-gap rounded-small-control px-md text-detail whitespace-nowrap shadow-raised min-block-pointer-button min-inline-history-action hover:tint-hover active:tint-pressed",
        )}
      >
        <action.icon
          size={ACTION_ICON_SIZE}
          aria-hidden="true"
          fill={action.icon === Play ? "currentColor" : "none"}
        />
        {action.text}
      </a>
      <HistoryRowMenu {entry} {onOpenSessions} />
    </span>
  </Item>
</li>
