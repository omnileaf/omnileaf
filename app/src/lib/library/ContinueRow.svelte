<script lang="ts">
  import { ChevronLeft, ChevronRight, Play } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Card } from "#lib/components/ui/card/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { historyList } from "#lib/history/history-list.svelte.ts";
  import SessionProgress from "#lib/history/SessionProgress.svelte";
  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import {
    realLook,
    type ShownCover,
    standInLook,
  } from "#lib/library/series-look.ts";
  import { whenInView } from "#lib/paging/in-view.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

  const ARROW_ICON_SIZE = 16;
  const PLAY_ICON_SIZE = 16;
  const EDGE_SLACK_PX = 1;

  let { usesStandIns }: { usesStandIns: boolean } = $props();

  const books = historyList(() => ({ kind: "unfinished" }));
  const headingId = $props.id();
  let list: HTMLUListElement | undefined = $state();
  let isAtStart = $state(true);
  let isAtEnd = $state(true);

  const arrows = $derived([
    {
      label: m.library_continue_previous(),
      icon: ChevronLeft,
      rtlIcon: ChevronRight,
      isDisabled: isAtStart,
      towardsEnd: false,
    },
    {
      label: m.library_continue_next(),
      icon: ChevronRight,
      rtlIcon: ChevronLeft,
      isDisabled: isAtEnd,
      towardsEnd: true,
    },
  ]);
  const entries = $derived(
    books.list.kind === "loaded" ? books.list.items : [],
  );

  function shown(entry: HistoryEntry): HistoryEntry {
    return usesStandIns ? standInHistoryEntry(entry) : entry;
  }

  function coverOf(entry: HistoryEntry): ShownCover {
    return (usesStandIns ? standInLook : realLook)({
      id: entry.series,
      title: entry.seriesTitle,
      cover: entry.cover,
    }).cover;
  }

  function noteEdges(): void {
    if (list === undefined) {
      return;
    }
    const scrolled = Math.abs(list.scrollLeft);
    isAtStart = scrolled <= EDGE_SLACK_PX;
    isAtEnd = scrolled + list.clientWidth >= list.scrollWidth - EDGE_SLACK_PX;
  }

  function page(towardsEnd: boolean): void {
    if (list === undefined) {
      return;
    }
    const readsRightToLeft = getComputedStyle(list).direction === "rtl";
    const step = towardsEnd === readsRightToLeft ? -1 : 1;
    list.scrollBy({ left: step * list.clientWidth, behavior: "smooth" });
  }

  $effect(() => {
    if (entries.length > 0) {
      noteEdges();
    }
  });

  onMount(() => {
    void books.start();
    return listenForLibraryChanges(() => {
      void books.load();
    }, reportError);
  });
</script>

{#if entries.length > 0}
  <section aria-labelledby={headingId} class="flex flex-col gap-sm">
    <div class="flex items-center gap-xs touch:max-medium:px-xs">
      <h2 id={headingId} class="flex-1 text-lead font-bold">
        {m.library_continue_reading()}
      </h2>
      {#each arrows as arrow (arrow.label)}
        <Tooltip label={arrow.label} aria-label={arrow.label}>
          {#snippet child({ props })}
            <Button
              {...props}
              type="button"
              look="outline"
              disabled={arrow.isDisabled}
              class="hidden items-center justify-center rounded-small-control shadow-raised block-pointer-target inline-pointer-target enabled:hover:tint-hover disabled:text-faint large:flex"
              onclick={() => {
                page(arrow.towardsEnd);
              }}
            >
              <arrow.icon
                size={ARROW_ICON_SIZE}
                aria-hidden="true"
                class="rtl:hidden"
              />
              <arrow.rtlIcon
                size={ARROW_ICON_SIZE}
                aria-hidden="true"
                class="ltr:hidden"
              />
            </Button>
          {/snippet}
        </Tooltip>
      {/each}
    </div>
    <ul
      bind:this={list}
      onscroll={noteEdges}
      class="flex snap-x snap-mandatory gap-md overflow-x-auto scroll-smooth pbe-2xs large:scrollbar-none touch:max-medium:px-xs"
    >
      {#each entries as listed (listed.book)}
        {@const entry = shown(listed)}
        <li
          class="shrink-0 snap-start inline-continue-card medium:inline-continue-card-wide large:inline-continue-third"
        >
          <Card class="relative flex items-center gap-md p-sm hover:tint-hover">
            <ListCover
              cover={coverOf(listed)}
              {coverUrl}
              class="rounded-history-cover inline-continue-cover"
            />
            <div class="flex flex-1 flex-col gap-2xs min-inline-none">
              <a
                href={resolve("/(app)/series/[id]", { id: entry.series })}
                class="flex flex-col gap-2xs outline-none min-inline-none before:absolute before:inset-none before:rounded-card focus-visible:before:outline-2 focus-visible:before:outline-accent"
              >
                <span class="truncate text-lead font-semibold">
                  {entry.seriesTitle}
                </span>
                <span class="truncate text-detail text-muted">
                  {entry.bookTitle}
                </span>
              </a>
              <span
                class="mbs-xs flex items-center gap-sm text-caption text-muted tabular-nums"
              >
                <SessionProgress readTo={entry.readTo} bar="flex-1" />
              </span>
            </div>
            <a
              href={resolve("/read/[book]", { book: entry.book })}
              aria-label={m.history_continue_label({
                series: entry.seriesTitle,
                book: entry.bookTitle,
              })}
              class="relative flex shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-control block-touch-target inline-touch-target hover:bg-accent-hover active:bg-accent-pressed desktop:block-pointer-button desktop:inline-pointer-button"
            >
              <Play
                size={PLAY_ICON_SIZE}
                aria-hidden="true"
                fill="currentColor"
              />
            </a>
          </Card>
        </li>
      {/each}
      {#if books.list.kind === "loaded" && !books.list.isComplete}
        {#key entries.length}
          <li
            aria-hidden="true"
            class="shrink-0 inline-2xs"
            {@attach whenInView(() => {
              void books.loadMore();
            })}
          ></li>
        {/key}
      {/if}
    </ul>
  </section>
{/if}
