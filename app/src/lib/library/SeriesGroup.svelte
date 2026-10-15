<script lang="ts">
  import { type ComponentProps, untrack } from "svelte";

  import type { IpcError } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { librarySeriesList, type ListSeries } from "./library-series.svelte";
  import SeriesCovers from "./SeriesCovers.svelte";

  type CountResult =
    { status: "ok"; data: number } | { status: "error"; error: IpcError };

  let {
    name,
    listSeries,
    countSeries,
    listed,
    covers,
  }: {
    name: string;
    listSeries: ListSeries;
    countSeries: () => Promise<CountResult>;
    listed: unknown;
    covers: Omit<
      ComponentProps<typeof SeriesCovers>,
      "series" | "isComplete" | "onNearEnd"
    >;
  } = $props();

  const list = librarySeriesList((after) => listSeries(after));
  let count: number | undefined = $state();
  const headingId = $props.id();

  $effect(() => {
    if (listed === undefined) {
      return;
    }
    untrack(() => {
      void list.start();
      void countSeries().then((result) => {
        count = result.status === "ok" ? result.data : undefined;
      });
    });
  });
</script>

{#if list.list.kind === "loaded" && list.list.items.length > 0}
  <section aria-labelledby={headingId} class="flex flex-col gap-md">
    <div class="flex items-baseline gap-sm">
      <h2 id={headingId} class="text-lead font-bold">{name}</h2>
      {#if count !== undefined}
        <p class="text-detail text-muted">
          {m.library_series_count({ count })}
        </p>
      {/if}
    </div>
    <SeriesCovers
      {...covers}
      series={list.list.items}
      isComplete={list.list.isComplete}
      onNearEnd={() => {
        void list.loadMore();
      }}
    />
  </section>
{/if}
