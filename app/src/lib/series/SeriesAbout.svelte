<script lang="ts">
  import {
    BookImage,
    ChevronDown,
    ChevronUp,
    Folder,
    Info,
    Pencil,
  } from "@lucide/svelte";
  import { tick } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Badge } from "#lib/components/ui/badge/index.ts";
  import {
    Card,
    CardAction,
    CardContent,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from "#lib/components/ui/collapsible/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import {
    Item,
    ItemContent,
    ItemMedia,
    ItemTitle,
  } from "#lib/components/ui/item/index.ts";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import type {
    Platform,
    ReadMark,
    SeriesOverview,
  } from "#lib/ipc/bindings.ts";
  import CoverImage from "#lib/library/CoverImage.svelte";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";

  import ComingSoonControl from "./ComingSoonControl.svelte";
  import SeriesActions from "./SeriesActions.svelte";
  import { SERIES_CONTROL } from "./series-control.ts";
  import SeriesCredits from "./SeriesCredits.svelte";
  import SeriesDetailsList from "./SeriesDetailsList.svelte";
  import SeriesSummary from "./SeriesSummary.svelte";

  const ICON_SIZE = 16;
  const NO_COVER_ICON_SIZE = 32;

  interface AboutLook {
    readonly column: string;
    readonly head: string;
    readonly cover: string;
    readonly lines: string;
    readonly title: string;
    readonly meta: string;
    readonly path: string;
    readonly pathIconSize: number;
  }

  const OTHER_LOOK: AboutLook = {
    column: "gap-xl expanded:gap-lg @series-split:inline-series-aside",
    head: "gap-lg",
    cover:
      "shadow-series-cover inline-series-cover expanded:inline-series-cover-wide",
    lines: "gap-xs expanded:gap-icon-gap",
    title: "text-series-title tracking-tight",
    meta: "text-small",
    path: "text-caption",
    pathIconSize: ICON_SIZE,
  };

  const MACOS_LOOK: AboutLook = {
    column: "gap-series-gap-macos @series-split:inline-series-aside-macos",
    head: "gap-series-gap-macos",
    cover: "shadow-native-series-cover inline-series-cover-macos",
    lines: "gap-xs",
    title:
      "text-native-series-title/native-series-title tracking-native-series-title",
    meta: "text-native-series-meta/native-series-meta",
    path: "text-native-series-path/native-series-path",
    pathIconSize: 13,
  };

  interface DetailsRow {
    readonly plate: string;
    readonly closed: IconName;
    readonly open: IconName;
  }

  const DETAILS_ROWS: Readonly<Record<Platform, DetailsRow | undefined>> = {
    ios: {
      plate: "overflow-hidden rounded-native-group bg-native-group",
      closed: "chevron-right",
      open: "chevron-down",
    },
    android: {
      plate: "-ms-page-start -me-page-end",
      closed: "chevron-down",
      open: "chevron-up",
    },
    linux: undefined,
    macos: undefined,
    windows: undefined,
  };

  let {
    overview,
    cover,
    coverUrl,
    isWide,
    onMarkAll,
    onEditDetails,
  }: {
    overview: SeriesOverview;
    cover: ShownCover;
    coverUrl: CoverUrl;
    isWide: boolean;
    onMarkAll: (mark: ReadMark) => Promise<void>;
    onEditDetails: (() => void) | undefined;
  } = $props();

  const platform = currentPlatform();
  const look = platform === "macos" ? MACOS_LOOK : OTHER_LOOK;
  const width = new WindowWidth();
  const detailsRow = $derived(
    isPhone(platform, width.current) ? DETAILS_ROWS[platform] : undefined,
  );

  let areDetailsOpen = $state(false);
  let details: HTMLElement | undefined = $state();

  const books = $derived(m.library_series_books({ count: overview.bookCount }));

  async function showAllCreators(): Promise<void> {
    areDetailsOpen = true;
    await tick();
    details?.scrollIntoView({ block: "nearest" });
    details?.focus({ preventScroll: true });
  }
</script>

<section
  aria-label={m.series_about()}
  class={["flex flex-col @series-split:shrink-0", look.column]}
>
  <div
    class={[
      "flex flex-col items-center text-center expanded:items-start expanded:text-start",
      look.head,
    ]}
  >
    <div
      role="img"
      aria-label={m.series_cover({ title: overview.title })}
      class={[
        "relative flex aspect-cover shrink-0 items-center justify-center overflow-hidden rounded-series-cover bg-chip text-muted",
        look.cover,
      ]}
    >
      {#if cover.kind === "none"}
        <BookImage size={NO_COVER_ICON_SIZE} aria-hidden="true" />
      {/if}
      <CoverImage {cover} {coverUrl} />
    </div>
    <div
      class={[
        "flex flex-col items-center max-inline-full expanded:items-start",
        look.lines,
      ]}
    >
      <h1
        tabindex="-1"
        class={[
          "line-clamp-3 font-bold text-balance expanded:text-pretty",
          look.title,
        ]}
      >
        {overview.title}
      </h1>
      <SeriesCredits
        class={look.meta}
        creators={overview.creators}
        from={overview.id}
        onShowAll={() => {
          void showAllCreators();
        }}
      />
      <p class={["text-muted", look.meta]}>
        {#if overview.bookCount === 0}
          {m.series_no_books_count()}
        {:else if overview.format === null}
          {books}
        {:else}
          {m.series_format_books({ format: overview.format, books })}
        {/if}
      </p>
      {#if overview.folder !== null}
        <p
          class={[
            "flex items-center gap-icon-gap text-muted max-inline-full",
            look.meta,
          ]}
        >
          <Folder
            size={look.pathIconSize}
            role="img"
            aria-label={m.series_folder()}
            class="shrink-0"
          />
          <span class={["truncate font-mono", look.path]}
            >{overview.folder}</span
          >
        </p>
      {/if}
    </div>
  </div>
  {#if overview.bookCount > 0}
    <SeriesActions {overview} {isWide} {onMarkAll} />
  {/if}
  {#if overview.bookCount > 0 && overview.summary !== null}
    <SeriesSummary summary={overview.summary} />
  {/if}
  {#if overview.bookCount > 0 && overview.tags.length > 0}
    <ul aria-label={m.series_tags()} class="flex flex-wrap gap-icon-gap">
      {#each overview.tags as tag (tag)}
        <li><Badge look="outline">{tag}</Badge></li>
      {/each}
    </ul>
  {/if}
  {#if overview.bookCount > 0 && isWide}
    <Card
      role="region"
      aria-label={m.series_details()}
      class="flex flex-col gap-md py-lg shadow-card-rest"
    >
      <CardHeader class="px-lg">
        <CardTitle class="text-title">{m.series_details()}</CardTitle>
        <CardAction>
          {#if onEditDetails === undefined}
            <ComingSoonControl
              label={m.series_edit_details()}
              class="flex items-center justify-center rounded-shadcn-control block-pointer-target inline-pointer-target"
            >
              <Pencil size={ICON_SIZE} aria-hidden="true" />
            </ComingSoonControl>
          {:else}
            <Tooltip
              label={m.series_edit_details()}
              type="button"
              aria-label={m.series_edit_details()}
              class="flex items-center justify-center rounded-shadcn-control text-foreground transition-control block-pointer-target inline-pointer-target hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent active:bg-pressed"
              onclick={onEditDetails}
            >
              <Pencil size={ICON_SIZE} aria-hidden="true" />
            </Tooltip>
          {/if}
        </CardAction>
      </CardHeader>
      <CardContent class="px-lg">
        <SeriesDetailsList {overview} bind:ref={details} />
      </CardContent>
    </Card>
  {:else if overview.bookCount > 0}
    <Collapsible bind:open={areDetailsOpen} class="flex flex-col gap-md">
      {#if detailsRow === undefined}
        <CollapsibleTrigger
          class={cn(SERIES_CONTROL, "justify-between text-foreground")}
        >
          <span class="flex items-center gap-sm">
            <Info size={ICON_SIZE} aria-hidden="true" />
            {m.series_details()}
          </span>
          {#if areDetailsOpen}
            <ChevronUp size={ICON_SIZE} aria-hidden="true" />
          {:else}
            <ChevronDown size={ICON_SIZE} aria-hidden="true" />
          {/if}
        </CollapsibleTrigger>
      {:else}
        <div class={detailsRow.plate}>
          <Item look="row" class={ROW_FOCUS_RING}>
            {#snippet child({ props })}
              <CollapsibleTrigger {...props}>
                <ItemMedia><Icon name="info" /></ItemMedia>
                <ItemContent
                  ><ItemTitle>{m.series_details()}</ItemTitle></ItemContent
                >
                <Icon
                  name={areDetailsOpen ? detailsRow.open : detailsRow.closed}
                  class="shrink-0 text-muted"
                />
              </CollapsibleTrigger>
            {/snippet}
          </Item>
        </div>
      {/if}
      <CollapsibleContent>
        <Card class="p-lg shadow-card-rest">
          <SeriesDetailsList {overview} bind:ref={details} />
        </Card>
      </CollapsibleContent>
    </Collapsible>
  {/if}
</section>
