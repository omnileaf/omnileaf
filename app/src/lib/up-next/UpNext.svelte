<script lang="ts">
  import { Check, Play } from "@lucide/svelte";
  import { onMount } from "svelte";

  import { Switch } from "#lib/components/ui/switch/index.ts";
  import { readingTime } from "#lib/history/reading-time.ts";
  import {
    type BookReading,
    commands,
    type SeriesNeighbour,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { BookId } from "#lib/reader/opened-book.ts";

  import { getSkipUpNextSetting } from "./skip-up-next.svelte.ts";

  const CHECK_SIZE = 24;
  const PLAY_SIZE = 18;
  const READING_NAMES = {
    notStarted: m.reader_unread,
    started: m.reader_started,
    read: m.reader_read,
  } satisfies Record<BookReading["state"], () => string>;

  let {
    book,
    title,
    seriesTitle,
    seriesHref,
    next,
    nextHref,
  }: {
    book: BookId;
    title: string;
    seriesTitle: string;
    seriesHref: string;
    next: SeriesNeighbour | null;
    nextHref: string | undefined;
  } = $props();

  const skipUpNext = getSkipUpNextSetting();
  const id = $props.id();
  let heading: HTMLHeadingElement | undefined = $state();
  let readSeconds: number | undefined = $state();

  const backLabel = $derived(m.reader_back_to_series({ series: seriesTitle }));
  const secondaryLook =
    "flex items-center justify-center rounded-card border text-center border-reader-glass-edge px-lg font-semibold transition-control min-inline-none min-block-touch-button hover:tint-reader-hover active:tint-reader-pressed expanded:text-small expanded:whitespace-nowrap";
  const primaryLook =
    "flex items-center justify-center gap-sm rounded-card bg-reader-accent text-center px-lg font-bold text-on-reader-accent min-block-touch-button expanded:text-small expanded:whitespace-nowrap";

  onMount(() => {
    heading?.focus();
    void commands.bookReadTime(book).then((read) => {
      if (read.status === "ok") {
        readSeconds = read.data;
      }
    });
  });
</script>

<div
  class="pointer-events-none absolute inset-none flex items-center justify-center bg-reader px-lg"
>
  <section
    aria-labelledby="{id}-heading"
    class="pointer-events-auto flex flex-col gap-lg inline-full max-inline-up-next"
  >
    <div
      class="flex flex-col items-center gap-xs text-center expanded:flex-row expanded:gap-md expanded:text-start"
    >
      <span
        aria-hidden="true"
        class="flex shrink-0 items-center justify-center rounded-full bg-reader-lit text-reader-accent block-reader-quick inline-reader-quick"
      >
        <Check size={CHECK_SIZE} />
      </span>
      <div class="flex flex-col gap-2xs">
        <h2
          id="{id}-heading"
          bind:this={heading}
          tabindex="-1"
          class="text-title font-bold"
        >
          {m.reader_finished({ title })}
        </h2>
        <p class="text-small text-reader-muted">
          {readSeconds === undefined
            ? m.reader_marked_read()
            : m.reader_marked_read_after({ time: readingTime(readSeconds) })}
        </p>
      </div>
    </div>
    {#if next !== null && nextHref !== undefined}
      <div
        class="flex items-center gap-md rounded-card border border-reader-glass-edge bg-reader-glass p-md"
      >
        <span
          class="aspect-cover shrink-0 overflow-hidden rounded-cover bg-reader-page inline-up-next-cover"
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
          <span class="text-caption font-bold text-reader-accent"
            >{m.reader_up_next()}</span
          >
          <span class="truncate text-callout font-bold">{next.title}</span>
          <span class="text-small text-reader-muted"
            >{READING_NAMES[next.reading.state]()}</span
          >
        </span>
      </div>
      <div class="flex flex-col gap-sm expanded:flex-row-reverse">
        <a
          href={nextHref}
          data-sveltekit-replacestate
          class={[primaryLook, "shrink-0 expanded:ms-auto"]}
        >
          <Play size={PLAY_SIZE} aria-hidden="true" class="fill-current" />
          {m.reader_read_next({ title: next.title })}
        </a>
        <a href={seriesHref} class={secondaryLook}
          ><span class="expanded:truncate">{backLabel}</span></a
        >
      </div>
    {:else}
      <a href={seriesHref} class={primaryLook}>{backLabel}</a>
    {/if}
    <Switch
      bind:checked={
        () => skipUpNext.isOn,
        (isOn: boolean) => {
          skipUpNext.turn(isOn);
        }
      }
      aria-labelledby="{id}-skip"
      aria-describedby="{id}-skip-help"
      class="flex items-center gap-md rounded-card border border-reader-glass-edge bg-reader-glass px-md py-sm text-start hover:tint-reader-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-reader-accent"
    >
      <span class="flex flex-1 flex-col gap-2xs">
        <span id="{id}-skip" class="font-semibold"
          >{m.reader_skip_this_screen()}</span
        >
        <span id="{id}-skip-help" class="text-detail text-reader-muted"
          >{m.reader_skip_this_screen_help()}</span
        >
      </span>
    </Switch>
    {#if next !== null}
      <p class="text-center text-small text-reader-muted expanded:text-start">
        <span class="desktop:hidden"
          >{m.reader_turn_again({ title: next.title })}</span
        >
        <span class="hidden desktop:inline"
          >{m.reader_press_again({ title: next.title })}</span
        >
      </p>
    {/if}
  </section>
</div>
