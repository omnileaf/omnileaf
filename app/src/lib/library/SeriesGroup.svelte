<script lang="ts">
  import { type ComponentProps, untrack } from "svelte";

  import { resolve } from "$app/paths";
  import { cn } from "#lib/components/cn.ts";
  import { variantClasses } from "#lib/components/ui/button/looks.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { ROW_SUBTITLE_MUTED_TYPE } from "#lib/components/ui/item/looks.ts";
  import type { IpcError } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { AndroidPhone } from "./android-phone.svelte";
  import { creatorRoute } from "./creator-route";
  import CreatorHeadingLink from "./CreatorHeadingLink.svelte";
  import { librarySeriesList, type ListSeries } from "./library-series.svelte";
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
  } = $props();

  const ANDROID_HEAD = "flex items-center gap-sm pbs-lg pbe-lg -me-md";
  const HEADING_TYPE =
    "text-native-group-heading/native-group-heading font-native-group-heading tracking-native-group-heading";
  const ANDROID_OPEN = cn(
    variantClasses("plain", "regular", true, "android"),
    "text-muted",
  );

  const android = new AndroidPhone();
  const list = librarySeriesList((after) => listSeries(after));
  let count: number | undefined = $state();
  const headingId = $props.id();

  let changesRead = untrack(() => libraryChanges);
  let countsAsked = 0;

  async function recount(): Promise<void> {
    countsAsked += 1;
    const asked = countsAsked;
    const result = await countSeries();
    if (asked === countsAsked) {
      count = result.status === "ok" ? result.data : undefined;
    }
  }

  $effect(() => {
    if (listed === undefined) {
      return;
    }
    untrack(() => {
      void list.start();
      void recount();
    });
  });

  $effect(() => {
    if (libraryChanges === changesRead) {
      return;
    }
    changesRead = libraryChanges;
    untrack(() => {
      void list.load();
      void recount();
    });
  });
</script>

{#if list.list.kind === "loaded" && list.list.items.length > 0}
  <section
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
