<script lang="ts">
  import {
    ListFilter,
    type LucideProps,
    RotateCcwClock,
    Search,
  } from "@lucide/svelte";
  import { Command } from "bits-ui";
  import type { Component } from "svelte";

  import type { HistoryEntry } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import {
    realLook,
    type ShownCover,
    standInLook,
  } from "#lib/library/series-look.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { standInHistoryEntry } from "#lib/series/series-stand-ins.ts";

  import {
    type Choice,
    choiceKey,
    continuesReading,
  } from "./quick-open-choice";

  const ICON_SIZE = 16;

  let {
    id,
    choice,
    isActive,
    usesStandIns,
    onChoose,
  }: {
    id: string;
    choice: Choice;
    isActive: boolean;
    usesStandIns: boolean;
    onChoose: () => void;
  } = $props();

  interface Shown {
    readonly cover?: ShownCover;
    readonly icon?: Component<LucideProps>;
    readonly label: string;
    readonly detail: string;
  }

  const lookOf = $derived(usesStandIns ? standInLook : realLook);

  function resumed(entry: HistoryEntry): string {
    const page = entry.reading.state === "started" ? entry.reading.page : null;
    return page === null
      ? entry.bookTitle
      : m.quick_open_resume({ book: entry.bookTitle, page });
  }

  const shown: Shown = $derived.by(() => {
    switch (choice.kind) {
      case "series": {
        const look = lookOf(choice.series);
        return {
          cover: look.cover,
          label: look.title,
          detail: m.library_series_books({ count: choice.series.bookCount }),
        };
      }
      case "place":
        return {
          icon: choice.place.icon,
          label: choice.place.label(),
          detail: choice.place.within?.() ?? "",
        };
      case "continue": {
        const entry = usesStandIns
          ? standInHistoryEntry(choice.entry)
          : choice.entry;
        return {
          cover: lookOf({
            id: entry.series,
            title: entry.seriesTitle,
            cover: entry.cover,
          }).cover,
          label: entry.seriesTitle,
          detail: resumed(entry),
        };
      }
      case "search":
        return choice.isRecent
          ? {
              icon: RotateCcwClock,
              label: choice.text,
              detail: m.quick_open_recent_search(),
            }
          : {
              icon: Search,
              label: m.quick_open_search_for({ text: choice.text }),
              detail: m.quick_open_search_page(),
            };
      case "showUnread":
        return {
          icon: ListFilter,
          label: m.quick_open_show_unread(),
          detail: m.quick_open_library_filter(),
        };
    }
  });
</script>

<Command.Item
  {id}
  value={choiceKey(choice)}
  class={[
    "flex cursor-default items-center gap-md rounded-field px-option-inline py-xs min-block-quick-open-option",
    isActive && "bg-accent-soft",
  ]}
  onSelect={onChoose}
>
  {#if shown.cover !== undefined}
    <span
      class="relative aspect-cover shrink-0 overflow-hidden rounded-quick-open-cover bg-chip inline-quick-open-cover"
    >
      <CoverImage cover={shown.cover} {coverUrl} />
    </span>
  {:else if shown.icon !== undefined}
    {@const Icon = shown.icon}
    <span
      class="flex shrink-0 items-center justify-center rounded-control bg-chip block-option-icon inline-option-icon"
    >
      <Icon size={ICON_SIZE} aria-hidden="true" />
    </span>
  {/if}
  <span class="flex flex-1 flex-col min-inline-none">
    <span class="truncate text-small font-semibold">{shown.label}</span>
    <span class={["text-caption", isActive ? "text-foreground" : "text-muted"]}>
      {shown.detail}
    </span>
  </span>
  {#if isActive}
    <span aria-hidden="true" class="shrink-0 text-caption text-foreground">
      {continuesReading(choice)
        ? m.quick_open_enter_continues()
        : m.search_key_open()}
    </span>
  {/if}
</Command.Item>
