<script lang="ts">
  import { BookOpen, ChevronDown, Eye, EyeOff, Tag } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import type { ReadMark, SeriesOverview } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ComingSoonControl from "./ComingSoonControl.svelte";
  import { SERIES_CONTROL } from "./series-control.ts";

  const ICON_SIZE = 16;

  let {
    overview,
    isWide,
    onMarkAll,
  }: {
    overview: SeriesOverview;
    isWide: boolean;
    onMarkAll: (mark: ReadMark) => Promise<void>;
  } = $props();

  const isAllRead = $derived(overview.readCount === overview.bookCount);
  const state = $derived.by(() => {
    if (isAllRead) {
      return m.series_state_read();
    }
    return overview.readCount > 0 ||
      overview.upNext?.reading.state === "started"
      ? m.series_state_reading()
      : m.series_state_unread();
  });
  const markLabel = $derived.by(() => {
    if (isWide) {
      return isAllRead ? m.series_mark_unread() : m.series_mark_read();
    }
    const title = overview.title;
    return isAllRead
      ? m.series_mark_series_unread({ title })
      : m.series_mark_series_read({ title });
  });
</script>

<div class="flex gap-sm @series-split:flex-col">
  <ComingSoonControl
    label={m.series_reading_state({ state })}
    class={cn(SERIES_CONTROL, "flex-1 justify-between text-foreground")}
  >
    <span class="flex items-center gap-sm">
      <BookOpen size={ICON_SIZE} aria-hidden="true" />
      {state}
    </span>
    <ChevronDown size={ICON_SIZE} aria-hidden="true" class="opacity-50" />
  </ComingSoonControl>
  <div class="flex gap-sm">
    <ComingSoonControl
      label={isWide
        ? m.series_tags()
        : m.series_tags_for({ title: overview.title })}
      class={cn(
        SERIES_CONTROL,
        "inline-touch-target max-expanded:px-none expanded:inline-auto @series-split:flex-1",
      )}
    >
      <Tag size={ICON_SIZE} aria-hidden="true" />
      {#if isWide}
        {m.series_tags()}
      {/if}
    </ComingSoonControl>
    <Button
      type="button"
      look="outline"
      aria-label={markLabel}
      class={cn(
        SERIES_CONTROL,
        "inline-touch-target max-expanded:px-none expanded:inline-auto @series-split:flex-1",
      )}
      onClickPromise={() => onMarkAll(isAllRead ? "unread" : "read")}
    >
      {#if isAllRead}
        <EyeOff size={ICON_SIZE} aria-hidden="true" />
      {:else}
        <Eye size={ICON_SIZE} aria-hidden="true" />
      {/if}
      {#if isWide}
        {markLabel}
      {/if}
    </Button>
  </div>
</div>
