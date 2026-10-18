<script lang="ts">
  import {
    ArrowLeft,
    ChevronLeft,
    CircleCheck,
    Library,
    Play,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { resolve } from "$app/paths";
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
  import { m } from "#lib/paraglide/messages.js";
  import type { BookId } from "#lib/reader/opened-book.ts";
  import { READER_BUTTON, READER_ICON_SIZE } from "#lib/reader/reader-bar.ts";
  import type { ReadingDirection } from "#lib/reader/reading-direction.svelte.ts";
  import { getSmartFeatures } from "#lib/reader/smart-features.svelte.ts";

  import ReadingStats from "./ReadingStats.svelte";
  import { getSkipUpNextSetting } from "./skip-up-next.svelte.ts";

  const CHECK_SIZE = 20;
  const BUTTON_ICON_SIZE = 16;
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
    seriesHref: string;
    next: SeriesNeighbour | null;
    nextHref: string | undefined;
    direction: ReadingDirection;
  } = $props();

  const skipUpNext = getSkipUpNextSetting();
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
  class="pointer-events-none absolute inset-none flex flex-col bg-background text-foreground ios:bg-ios-grouped"
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
  <div
    class="flex flex-1 items-center justify-center overflow-y-auto px-lg py-xl"
  >
    <section
      aria-labelledby="{id}-heading"
      class="pointer-events-auto flex flex-col gap-lg inline-full max-inline-up-next"
    >
      <div class="flex items-start gap-md">
        <span
          aria-hidden="true"
          class="flex shrink-0 items-center justify-center rounded-full bg-chip block-up-next-check inline-up-next-check"
        >
          <CircleCheck size={CHECK_SIZE} />
        </span>
        <div class="flex flex-col gap-2xs min-inline-none">
          <h2
            id="{id}-heading"
            bind:this={heading}
            tabindex="-1"
            class="text-title font-semibold text-pretty"
          >
            {m.reader_finished({ title })}
          </h2>
          <p class="text-small text-muted expanded:hidden">
            {time === undefined
              ? m.reader_marked_read_in({ series: seriesTitle })
              : m.reader_marked_read_in_after({ series: seriesTitle, time })}
          </p>
          <p class="hidden text-small text-muted expanded:block">
            {time === undefined
              ? m.reader_marked_read()
              : m.reader_marked_read_after({ time })}
          </p>
        </div>
      </div>
      {#if stats !== undefined}
        <ReadingStats {title} {...stats} />
      {/if}
      <Card class="flex flex-col gap-lg py-lg expanded:gap-xl expanded:py-xl">
        {#if next !== null && nextHref !== undefined}
          <CardHeader class="px-lg expanded:px-xl">
            <CardTitle class="text-body expanded:text-title"
              >{m.reader_up_next()}</CardTitle
            >
          </CardHeader>
          <CardContent class="flex items-center gap-md px-lg expanded:px-xl">
            <span
              class="aspect-cover shrink-0 overflow-hidden rounded-cover bg-chip inline-up-next-cover expanded:inline-up-next-cover-wide"
            >
              {#if next.cover !== null}
                <img
                  src={coverUrl(next.cover)}
                  alt=""
                  class="object-cover block-full inline-full"
                />
              {/if}
            </span>
            <span class="flex flex-col gap-2xs min-inline-none">
              <span
                class="line-clamp-2 text-group-title font-semibold expanded:text-body"
                >{next.title}</span
              >
              <span class="text-small text-muted">{nextDetails(next)}</span>
            </span>
          </CardContent>
          <CardFooter
            class="flex flex-col gap-sm px-lg expanded:flex-row expanded:px-xl"
          >
            <a
              href={nextHref}
              data-sveltekit-replacestate
              class={cn(PRIMARY, "inline-full expanded:flex-1")}
            >
              <Play
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class="truncate"
                >{m.reader_read_next({ title: next.title })}</span
              >
              <Kbd
                aria-hidden="true"
                class="hidden border-transparent bg-on-accent text-accent desktop:inline"
                >{nextKey}</Kbd
              >
            </a>
            <a
              href={seriesHref}
              class={cn(SECONDARY, "inline-full expanded:flex-1")}
            >
              <ArrowLeft
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class="truncate">{m.reader_back_to_the_series()}</span>
              <Kbd
                aria-hidden="true"
                class="hidden border-transparent bg-transparent px-none font-medium text-muted desktop:inline"
                >{m.reader_key_esc()}</Kbd
              >
            </a>
          </CardFooter>
        {:else}
          <CardHeader class="px-lg expanded:px-xl">
            <CardTitle class="text-body expanded:text-title"
              >{m.reader_series_finished()}</CardTitle
            >
            <CardDescription class="text-small"
              >{m.reader_series_finished_body()}</CardDescription
            >
          </CardHeader>
          <CardFooter
            class="flex flex-col gap-sm px-lg expanded:flex-row expanded:px-xl"
          >
            <a
              href={seriesHref}
              class={cn(PRIMARY, "inline-full expanded:flex-1")}
            >
              <ArrowLeft
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class="truncate">{m.reader_back_to_the_series()}</span>
            </a>
            <a
              href={resolve("/(app)")}
              class={cn(SECONDARY, "inline-full expanded:flex-1")}
            >
              <Library
                size={BUTTON_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0"
              />
              <span class="truncate">{m.reader_back_label()}</span>
            </a>
          </CardFooter>
        {/if}
      </Card>
      {#if next !== null}
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
