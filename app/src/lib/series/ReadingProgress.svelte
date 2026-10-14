<script lang="ts">
  import { Eye, EyeOff, Play } from "@lucide/svelte";

  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Progress } from "#lib/components/ui/progress/index.ts";
  import type {
    ReadMark,
    SeriesBook,
    SeriesOverview,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  const ICON_SIZE = 16;

  let {
    overview,
    onMarkAll,
  }: {
    overview: SeriesOverview;
    onMarkAll: (mark: ReadMark) => Promise<void>;
  } = $props();

  const countId = $props.id();
  const isAllRead = $derived(overview.readCount === overview.bookCount);

  function upNext(book: SeriesBook | null): string {
    if (book === null) {
      return m.series_all_read();
    }
    const { reading, title } = book;
    switch (reading.state) {
      case "notStarted":
        return m.series_start({ title });
      case "started":
        return reading.page === null
          ? m.series_continue({ title })
          : m.series_continue_at({ title, page: reading.page });
      case "read":
        return m.series_all_read();
    }
  }
</script>

<div class="flex flex-col gap-sm">
  {#if overview.upNext === null || overview.upNext.reading.state === "read"}
    <p class="text-lead font-semibold">{upNext(overview.upNext)}</p>
  {:else}
    <a
      href={resolve("/read/[book]", { book: overview.upNext.id })}
      class="flex items-center justify-center gap-sm rounded-control bg-accent px-md py-sm text-center text-body font-bold text-on-accent transition-control min-block-touch-target hover:bg-accent-hover active:bg-accent-pressed"
    >
      <Play size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
      {upNext(overview.upNext)}
    </a>
  {/if}
  <div class="flex flex-col gap-xs">
    <Progress
      aria-labelledby={countId}
      max={overview.bookCount}
      value={overview.readCount}
    />
    <p id={countId} class="text-caption text-muted tabular-nums">
      {m.series_read_count({
        read: overview.readCount,
        total: overview.bookCount,
      })}
    </p>
  </div>
  <Button
    type="button"
    look="outline"
    class="flex items-center gap-icon-gap self-start px-md text-detail block-pointer-target"
    onClickPromise={() => onMarkAll(isAllRead ? "unread" : "read")}
  >
    {#if isAllRead}
      <EyeOff size={ICON_SIZE} aria-hidden="true" />
      {m.series_mark_all_unread()}
    {:else}
      <Eye size={ICON_SIZE} aria-hidden="true" />
      {m.series_mark_all_read()}
    {/if}
  </Button>
</div>
