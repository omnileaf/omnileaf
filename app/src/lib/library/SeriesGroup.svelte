<script lang="ts">
  import { type ComponentProps, untrack } from "svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { variantClasses } from "#lib/components/ui/button/looks.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { ROW_SUBTITLE_MUTED_TYPE } from "#lib/components/ui/item/looks.ts";
  import type { IpcError } from "#lib/ipc/bindings.ts";
  import { sendingNewest } from "#lib/navigation/newest-call.ts";
  import { whileNear } from "#lib/paging/in-view.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { itemsDrawnIn } from "#lib/virtual-grid/drawn-items.ts";

  import { AndroidPhone } from "./android-phone.svelte";
  import { creatorRoute } from "./creator-route";
  import CreatorHeadingLink from "./CreatorHeadingLink.svelte";
  import { librarySeriesList, type ListSeries } from "./library-series.svelte";
  import type { KeepGroup, KeptGroup } from "./library-return";
  import SeriesCovers from "./SeriesCovers.svelte";

  type CountResult =
    { status: "ok"; data: number } | { status: "error"; error: IpcError };

  let {
    name,
    creator,
    pointer,
    listSeries,
    countSeries,
    listed,
    libraryChanges,
    covers,
    kept,
    keeps,
  }: {
    name: string;
    creator?: string | undefined;
    pointer?: string | undefined;
    listSeries: ListSeries;
    countSeries: () => Promise<CountResult>;
    listed: unknown;
    libraryChanges: number;
    covers: Omit<
      ComponentProps<typeof SeriesCovers>,
      "series" | "isComplete" | "onNearEnd"
    >;
    kept?: KeptGroup | undefined;
    keeps?: ((keep: KeepGroup) => () => void) | undefined;
  } = $props();

  const ANDROID_HEAD = "flex items-center gap-sm pbs-lg pbe-lg -me-md";
  const HEADING_TYPE =
    "text-native-group-heading/native-group-heading font-native-group-heading tracking-native-group-heading";
  const ANDROID_OPEN = cn(
    variantClasses("plain", "regular", true, "android"),
    "text-muted",
  );

  const android = new AndroidPhone();
  const keptAtStart = untrack(() => kept);
  const list = librarySeriesList(
    (after) => listSeries(after),
    keptAtStart?.series,
  );
  let count: number | undefined = $state(keptAtStart?.count);
  const headingId = $props.id();
  let section: HTMLElement | undefined = $state();
  let startsFromKept = keptAtStart !== undefined;

  let changesRead = untrack(() => libraryChanges);
  let countsAsked = 0;
  let isNear = false;
  let isStale = false;
  const isShown = $derived(
    list.list.kind === "loaded" && list.list.items.length > 0,
  );

  function isSettledEmpty(): boolean {
    return list.list.kind !== "loading" && !isShown;
  }

  async function recount(): Promise<void> {
    countsAsked += 1;
    const asked = countsAsked;
    const result = await countSeries();
    if (asked === countsAsked) {
      count = result.status === "ok" ? result.data : undefined;
    }
  }

  const reloadSoon = sendingNewest<undefined>(async () => {
    await Promise.all([list.load(), recount()]);
  });

  function followNearness(isNowNear: boolean): void {
    isNear = isNowNear;
    if (isNear && isStale) {
      isStale = false;
      reloadSoon(undefined);
    }
  }

  function keptNow(): KeptGroup | undefined {
    const series = list.pagesThroughShown(
      section === undefined ? 0 : itemsDrawnIn(section),
    );
    return series === undefined ? undefined : { series, count };
  }

  $effect(() => keeps?.(keptNow));

  $effect(() => {
    if (listed === undefined) {
      return;
    }
    untrack(() => {
      if (startsFromKept) {
        startsFromKept = false;
        readAgainOnceNear();
        return;
      }
      isStale = false;
      void list.start();
      void recount();
    });
  });

  function readAgainOnceNear(): void {
    if (isNear || isSettledEmpty()) {
      reloadSoon(undefined);
    } else {
      isStale = true;
    }
  }

  $effect(() => {
    if (libraryChanges === changesRead) {
      return;
    }
    changesRead = libraryChanges;
    untrack(readAgainOnceNear);
  });

  $effect(() => {
    if (!isSettledEmpty() || !isStale) {
      return;
    }
    isStale = false;
    untrack(() => {
      reloadSoon(undefined);
    });
  });
</script>

{#if list.list.kind === "loaded" && isShown}
  <section
    bind:this={section}
    {@attach whileNear(followNearness)}
    aria-labelledby={headingId}
    class={["flex flex-col", !android.isOn && "gap-md"]}
  >
    {#if android.isOn}
      <div class={ANDROID_HEAD}>
        <div class="flex flex-1 flex-col min-inline-none">
          <h2 id={headingId} class={HEADING_TYPE}>{name}</h2>
          {@render seriesCount(ROW_SUBTITLE_MUTED_TYPE)}
        </div>
        {#if creator !== undefined}
          <a
            href={resolve("/(app)/creator/[name]", creatorRoute(creator))}
            aria-label={m.library_open_creator({ name: creator })}
            class={ANDROID_OPEN}
          >
            <Icon name="chevron-right" class="rtl:-scale-x-100" />
          </a>
        {/if}
      </div>
    {:else}
      <div class="flex items-baseline gap-sm">
        <h2 id={headingId} class={HEADING_TYPE}>
          {#if creator === undefined}
            {name}
          {:else}
            <CreatorHeadingLink name={creator} />
          {/if}
        </h2>
        {@render seriesCount(
          "text-detail text-muted ios:tracking-native-group-footer",
        )}
      </div>
    {/if}
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

{#snippet seriesCount(type: string)}
  {#if count !== undefined}
    <p class={type}>
      {m.library_series_count({ count })}
      {#if pointer !== undefined}
        <span aria-hidden="true">·</span>
        {pointer}
      {/if}
    </p>
  {/if}
{/snippet}
