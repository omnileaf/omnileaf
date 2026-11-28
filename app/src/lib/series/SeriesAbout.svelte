<script lang="ts">
  import { ChevronDown, ChevronUp, Info, Pencil } from "@lucide/svelte";
  import { tick } from "svelte";

  import { cn } from "#lib/components/cn.ts";

  import { resolve } from "$app/paths";
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
    SeriesDetails,
    SeriesOverview,
  } from "#lib/ipc/bindings.ts";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import { marksBooksNotConnected } from "#lib/library/not-connected.ts";
  import NotConnectedTag from "#lib/library/NotConnectedTag.svelte";
  import type { ShownCover } from "#lib/library/series-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone, isPointer } from "#lib/page/platform.ts";
  import { WINDOWS_CARD_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";

  import AboutCover from "./AboutCover.svelte";
  import ComingSoonControl from "./ComingSoonControl.svelte";
  import SeriesActions from "./SeriesActions.svelte";
  import { SERIES_CONTROL } from "./series-control.ts";
  import SeriesCredits from "./SeriesCredits.svelte";
  import SeriesDetailsList from "./SeriesDetailsList.svelte";
  import SeriesFolderLine from "./SeriesFolderLine.svelte";
  import SeriesSummary from "./SeriesSummary.svelte";
  import {
    ABOUT_COLUMN,
    ABOUT_DETAILS_CARD,
    ABOUT_HEAD,
    ABOUT_LINES,
    ABOUT_META,
    ABOUT_TAG,
    ABOUT_TITLE,
  } from "./series-about-layout.ts";
  import { navigateTo } from "#lib/navigation/navigate-to.ts";

  const ICON_SIZE = 16;

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

  type OrderLinePlace = "aboveDetails";

  const ORDER_LINE_PLACES: Readonly<
    Record<Platform, OrderLinePlace | undefined>
  > = {
    android: "aboveDetails",
    ios: undefined,
    linux: undefined,
    macos: undefined,
    windows: undefined,
  };

  let {
    overview,
    details: sourced,
    cover,
    coverUrl,
    isWide,
    onMarkAll,
    onEditDetails,
  }: {
    overview: SeriesOverview;
    details?: SeriesDetails | undefined;
    cover: ShownCover;
    coverUrl: CoverUrl;
    isWide: boolean;
    onMarkAll: (mark: ReadMark) => Promise<void>;
    onEditDetails: (() => void) | undefined;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isNotConnected = $derived(
    marksBooksNotConnected(platform) &&
      overview.connection.kind === "notConnected",
  );
  const detailsRow = $derived(
    isPhone(platform, width.current) ? DETAILS_ROWS[platform] : undefined,
  );
  const orderLinePlace = $derived(
    isPointer(platform) || isPhone(platform, width.current)
      ? ORDER_LINE_PLACES[platform]
      : undefined,
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

<section aria-label={m.series_about()} class={ABOUT_COLUMN}>
  <div class={ABOUT_HEAD}>
    <AboutCover
      title={overview.title}
      {cover}
      {coverUrl}
      isDimmed={isNotConnected}
    />
    <div class={ABOUT_LINES}>
      <h1 tabindex="-1" class={ABOUT_TITLE}>
        {overview.title}
      </h1>
      <SeriesCredits
        creators={overview.creators}
        from={overview.id}
        onShowAll={() => {
          void showAllCreators();
        }}
      />
      <p class={ABOUT_META}>
        {#if overview.bookCount === 0}
          {m.series_no_books_count()}
        {:else if overview.format === null}
          {books}
        {:else}
          {m.series_format_books({ format: overview.format, books })}
        {/if}
        {#if isNotConnected}
          <NotConnectedTag class="ms-xs align-middle" />
        {/if}
      </p>
      {#if overview.folder !== null}
        <SeriesFolderLine folder={overview.folder} />
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
        <li>
          <a
            href={resolve("/(app)")}
            onclick={(event) => {
              event.preventDefault();
              void navigateTo(resolve("/(app)"), {
                state: { libraryTag: tag },
              });
            }}
            class="rounded-full focus-visible:focus-ring"
          >
            <Badge
              look="outline"
              class={[
                "windows:rounded-none windows:border-0 windows:bg-transparent windows:px-none windows:text-caption windows:text-muted",
                ABOUT_TAG,
              ]}
            >
              {tag}
            </Badge>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
  {#if overview.bookCount > 0 && isWide}
    <Card
      role="region"
      aria-label={m.series_details()}
      class={[
        "flex flex-col gap-md py-lg shadow-card-rest",
        WINDOWS_CARD_PLATE,
      ]}
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
        <SeriesDetailsList
          {overview}
          {sourced}
          hasOrderLineAbove={orderLinePlace === "aboveDetails"}
          bind:ref={details}
        />
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
                <ItemContent>
                  <ItemTitle>{m.series_details()}</ItemTitle>
                </ItemContent>
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
        <Card
          class={[
            "p-lg shadow-card-rest",
            WINDOWS_CARD_PLATE,
            ABOUT_DETAILS_CARD,
          ]}
        >
          <SeriesDetailsList
            {overview}
            {sourced}
            hasOrderLineAbove={orderLinePlace === "aboveDetails"}
            bind:ref={details}
          />
        </Card>
      </CollapsibleContent>
    </Collapsible>
  {/if}
</section>
