<script lang="ts">
  import {
    ArrowLeft,
    BookImage,
    ChevronLeft,
    CircleCheck,
    Library,
    Play,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { resolve } from "$app/paths";
  import type { ResolvedPathname } from "$app/types";
  import { cn } from "#lib/components/cn.ts";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "#lib/components/ui/card/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import {
    type BookReading,
    commands,
    type ReadingSummary,
    type SeriesNeighbour,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import {
    type ActionGroupLook,
    actionGroupLook,
  } from "#lib/page/action-group.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, isPhone } from "#lib/page/platform.ts";
  import { GROUP_PLATE } from "#lib/page/plates.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { BookId } from "#lib/reader/opened-book.ts";
  import { READER_BUTTON, READER_ICON_SIZE } from "#lib/reader/reader-bar.ts";
  import type { ReadingDirection } from "#lib/reader/reading-direction.svelte.ts";
  import { getSmartFeatures } from "#lib/reader/smart-features.svelte.ts";
  import SettingSwitch from "#lib/settings/SettingSwitch.svelte";

  import ReadingStats from "./ReadingStats.svelte";
  import { getSkipUpNextSetting } from "./skip-up-next.svelte.ts";

  const CHECK_SIZE = 20;
  const BUTTON_ICON_SIZE = 16;
  const NO_COVER_ICON_SIZE = 24;
  const READING_NAMES = {
    notStarted: m.reader_unread,
    started: m.reader_started,
    read: m.reader_read,
  } satisfies Record<BookReading["state"], () => string>;
  const READING_WORDS = {
    notStarted: m.reader_unread_word,
    started: m.reader_started_word,
    read: m.reader_read_word,
  } satisfies Record<BookReading["state"], () => string>;
  const PRIMARY =
    "flex items-center justify-center gap-sm rounded-shadcn-button bg-accent px-lg text-center text-body font-medium text-on-accent transition-control min-inline-none min-block-touch-target hover:bg-accent-hover active:bg-accent-pressed expanded:text-small expanded:min-block-pointer-button ios:rounded-ios-button ios:min-block-ios-control";
  const SECONDARY =
    "flex items-center justify-center gap-sm rounded-shadcn-button border border-border bg-card px-lg text-center text-body font-medium transition-control min-inline-none min-block-touch-target hover:bg-hover active:bg-pressed expanded:text-small expanded:min-block-pointer-button ios:rounded-ios-button ios:min-block-ios-control ios:border-transparent ios:bg-ios-fill";
  const CARD_ACTIONS = {
    group: "flex flex-col gap-sm px-lg expanded:flex-row expanded:px-xl",
    main: cn(PRIMARY, "inline-full expanded:flex-1"),
    other: cn(SECONDARY, "inline-full expanded:flex-1"),
  } satisfies ActionGroupLook;
  const ACROSS_THE_CARD = "inline-full whitespace-normal text-center";

  let {
    book,
    title,
    seriesTitle,
    seriesHref,
    next,
    nextHref,
    direction,
  }: {
    book: BookId;
    title: string;
    seriesTitle: string;
    seriesHref: ResolvedPathname;
    next: SeriesNeighbour | null;
    nextHref: ResolvedPathname | undefined;
    direction: ReadingDirection;
  } = $props();

  const skipUpNext = getSkipUpNextSetting();
  const platform = currentPlatform();
  const width = new WindowWidth();
  const isOnPhone = $derived(isPhone(platform, width.current));
  const centresHead = $derived(isOnPhone && platform === "ios");
  const actions = $derived(
    acrossTheCard(actionGroupLook(platform, width.current, CARD_ACTIONS)),
  );
  const actionLabel = $derived(
    isOnPhone ? "min-inline-none wrap-anywhere" : "truncate",
  );
  const smartFeatures = getSmartFeatures();
  const id = $props.id();
  let heading: HTMLHeadingElement | undefined = $state();
  let summary = $state<ReadingSummary | null>(null);

  const nextKey = $derived(direction === "rightToLeft" ? "←" : "→");
  const stats = $derived(
    summary === null ||
      summary.secondsPerPage === null ||
      !smartFeatures.showsBookSummary
      ? undefined
      : { ...summary, secondsPerPage: summary.secondsPerPage },
  );
  const time = $derived(
    summary === null || stats !== undefined
      ? undefined
      : readingTime(summary.readSeconds),
  );

  function acrossTheCard(look: ActionGroupLook): ActionGroupLook {
    return isOnPhone
      ? {
          group: CARD_ACTIONS.group,
          main: cn(look.main, ACROSS_THE_CARD),
          other: cn(look.other, ACROSS_THE_CARD),
        }
      : look;
  }

  function nextDetails(next: SeriesNeighbour): string {
    return next.pageCount === null
      ? READING_NAMES[next.reading.state]()
      : m.reader_next_details({
          count: next.pageCount,
          reading: READING_WORDS[next.reading.state](),
        });
  }

  onMount(() => {
    heading?.focus();
    void commands.readingSummary(book).then((read) => {
      if (read.status === "ok") {
        summary = read.data;
      }
    });
  });
</script>

<div
  data-ground="grouped"
  class="pointer-events-none absolute inset-none flex flex-col bg-background text-foreground touch:bg-native-grouped-ground"
>
  <nav
    aria-label={m.reader_breadcrumb()}
    class="pointer-events-auto flex items-center gap-xs self-start px-reader-bar-inline pbs-reader-bar-top min-inline-none expanded:px-lg expanded:pbs-md"
  >
    <a
      href={seriesHref}
      aria-label={m.reader_back_to_series({ series: seriesTitle })}
      class={READER_BUTTON}
    >
      <ChevronLeft size={READER_ICON_SIZE} aria-hidden="true" />
    </a>
    <Breadcrumb class="hidden text-small expanded:block">
      <BreadcrumbItem class="min-inline-none">
        <a
          href={seriesHref}
          class="block truncate text-muted transition-control max-inline-reader-crumb-series hover:text-foreground"
          >{seriesTitle}</a
        >
      </BreadcrumbItem>
      <BreadcrumbSeparator class="text-muted" />
      <BreadcrumbItem class="min-inline-none">
        <BreadcrumbPage class="block truncate max-inline-reader-crumb-book">
          {title}
        </BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  </nav>
  <div class="flex flex-1 flex-col overflow-y-auto px-lg py-xl">
    <section
      aria-labelledby="{id}-heading"
      class="pointer-events-auto m-auto flex flex-col gap-lg inline-full max-inline-up-next"
    >
      <div
        class={isOnPhone
          ? ["flex flex-col gap-sm", centresHead && "items-center text-center"]
          : "flex items-start gap-md"}
      >
        {#if centresHead}
          <Icon
            name="circle-check"
            class="text-native-on-button-plain block-up-next-check inline-up-next-check"
          />
        {:else if !isOnPhone}
          <span
            aria-hidden="true"
            class="flex shrink-0 items-center justify-center rounded-full bg-chip block-up-next-check inline-up-next-check"
          >
            <CircleCheck size={CHECK_SIZE} />
          </span>
        {/if}
        <div
          class={[
            "flex flex-col gap-2xs min-inline-none",
            isOnPhone && "self-stretch",
          ]}
        >
          <h2
            id="{id}-heading"
            bind:this={heading}
            tabindex="-1"
            class={isOnPhone
              ? "text-native-end-title/native-end-title font-native-end-title tracking-native-end-title text-balance wrap-break-word"
              : "text-title font-semibold text-pretty"}
          >
            {m.reader_finished({ title })}
          </h2>
          <p
            class={[
              isOnPhone ? ROW_SUBTITLE_TYPE : "text-small",
              "wrap-break-word text-muted expanded:hidden",
            ]}
          >
            {time === undefined
              ? m.reader_marked_read_in({ series: seriesTitle })
              : m.reader_marked_read_in_after({ series: seriesTitle, time })}
          </p>
          <p
            class="hidden text-small wrap-break-word text-muted expanded:block"
          >
            {time === undefined
              ? m.reader_marked_read()
              : m.reader_marked_read_after({ time })}
          </p>
        </div>
      </div>
      {#if stats !== undefined}
        <ReadingStats {title} {...stats} {isOnPhone} />
      {/if}
      <Card class="flex flex-col gap-lg py-lg expanded:gap-xl expanded:py-xl">
        {#if next !== null && nextHref !== undefined}
          <CardHeader class="px-lg expanded:px-xl">
            <CardTitle
              class={isOnPhone
                ? "text-native-notice-label/native-notice-label font-native-notice-label tracking-native-notice-label text-muted"
                : "text-body expanded:text-title"}
              >{m.reader_up_next()}</CardTitle
            >
          </CardHeader>
          <CardContent class="flex items-center gap-md px-lg expanded:px-xl">
            <span
              data-up-next-cover
              class={[
                "aspect-cover shrink-0 overflow-hidden bg-chip inline-up-next-cover expanded:inline-up-next-cover-wide",
                isOnPhone
                  ? "flex items-center justify-center rounded-native-cover text-muted"
                  : "rounded-cover",
              ]}
            >
              {#if next.cover !== null}
                <img
                  src={coverUrl(next.cover)}
                  alt=""
                  class="object-cover block-full inline-full"
                />
              {:else if isOnPhone}
                <BookImage size={NO_COVER_ICON_SIZE} aria-hidden="true" />
              {/if}
            </span>
            <span class="flex flex-col gap-2xs min-inline-none">
              <span
                class={[
                  "line-clamp-2",
                  isOnPhone
                    ? "text-native-end-book/native-end-book font-native-end-book tracking-native-end-book wrap-break-word"
                    : "text-group-title font-semibold expanded:text-body",
                ]}>{next.title}</span
              >
              <span
                class={[
                  isOnPhone ? ROW_SUBTITLE_TYPE : "text-small",
                  "text-muted",
                ]}>{nextDetails(next)}</span
              >
            </span>
          </CardContent>
          <CardFooter class={actions.group}>
            <a href={nextHref} data-sveltekit-replacestate class={actions.main}>
              <Play
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class={actionLabel}
                >{m.reader_read_next({ title: next.title })}</span
              >
              <Kbd
                aria-hidden="true"
                class="hidden border-transparent bg-on-accent text-accent desktop:inline"
                >{nextKey}</Kbd
              >
            </a>
            <a href={seriesHref} class={actions.other}>
              <ArrowLeft
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class={actionLabel}>{m.reader_back_to_the_series()}</span>
              <Kbd
                aria-hidden="true"
                class="hidden border-transparent bg-transparent px-none font-medium text-muted desktop:inline"
                >{m.reader_key_esc()}</Kbd
              >
            </a>
          </CardFooter>
        {:else}
          <CardHeader class="px-lg expanded:px-xl">
            <CardTitle
              class={isOnPhone
                ? "text-native-end-card-title/native-end-card-title font-native-end-card-title tracking-native-end-card-title"
                : "text-body expanded:text-title"}
              >{m.reader_series_finished()}</CardTitle
            >
            <CardDescription
              class={isOnPhone ? ROW_SUBTITLE_TYPE : "text-small"}
              >{m.reader_series_finished_body()}</CardDescription
            >
          </CardHeader>
          <CardFooter class={actions.group}>
            <a href={seriesHref} class={actions.main}>
              <ArrowLeft
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class={actionLabel}>{m.reader_back_to_the_series()}</span>
            </a>
            <a href={resolve("/(app)")} class={actions.other}>
              <Library
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class={actionLabel}>{m.reader_back_label()}</span>
            </a>
          </CardFooter>
        {/if}
      </Card>
      {#if next !== null && isOnPhone}
        <div
          class={[
            "overflow-hidden rounded-card border border-border bg-card",
            GROUP_PLATE,
          ]}
        >
          <SettingSwitch
            label={m.reader_skip_this_screen()}
            description={m.reader_skip_this_screen_help()}
            isOn={skipUpNext.isOn}
            onToggle={() => {
              skipUpNext.turn(!skipUpNext.isOn);
            }}
          />
        </div>
      {:else if next !== null}
        <Switch
          bind:checked={
            () => skipUpNext.isOn,
            (isOn: boolean) => {
              skipUpNext.turn(isOn);
            }
          }
          aria-labelledby="{id}-skip"
          aria-describedby="{id}-skip-help"
          class="flex items-start gap-md text-start focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span class="flex flex-1 flex-col gap-2xs">
            <span
              id="{id}-skip"
              class="text-body font-medium expanded:text-small"
              >{m.reader_skip_this_screen()}</span
            >
            <span id="{id}-skip-help" class="text-small text-muted"
              >{m.reader_skip_this_screen_help()}</span
            >
          </span>
        </Switch>
      {/if}
      <p class="text-center text-small text-muted">
        <span class="desktop:hidden"
          >{next === null
            ? m.reader_turn_again_to_series()
            : m.reader_turn_again({ title: next.title })}</span
        >
        <span class="hidden desktop:inline"
          >{next === null
            ? m.reader_press_again_to_series({ key: nextKey })
            : m.reader_press_again({ key: nextKey, title: next.title })}</span
        >
      </p>
    </section>
  </div>
</div>
