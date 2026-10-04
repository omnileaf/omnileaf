<script lang="ts">
  import type { SeriesBook, SeriesOverview } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  let { overview }: { overview: SeriesOverview } = $props();

  const countId = $props.id();

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
  <p class="flex flex-col">
    <span class="text-caption text-muted">{m.series_up_next()}</span>
    <span class="text-lead font-semibold">{upNext(overview.upNext)}</span>
  </p>
  <div class="flex flex-col gap-xs">
    <progress
      aria-labelledby={countId}
      class="progress-track block-series-progress"
      max={overview.bookCount}
      value={overview.readCount}
    ></progress>
    <p id={countId} class="text-caption text-muted">
      {m.series_read_count({
        read: overview.readCount,
        total: overview.bookCount,
      })}
    </p>
  </div>
</div>
