<script lang="ts">
  import type { LibrarySeries, LibraryView } from "#lib/ipc/bindings.ts";
  import type { CoverUrl } from "#lib/library/cover-url.ts";
  import ListCover from "#lib/library/ListCover.svelte";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import { GROUPED_GROUP_LOOK } from "#lib/library/group-look.ts";
  import { SCREEN_SIZES } from "#lib/library/library-view.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import type { Reveal } from "#lib/virtual-grid/grid-keys.ts";
  import VirtualGrid from "#lib/virtual-grid/VirtualGrid.svelte";

  import { matchedWords } from "./matched-words";

  let {
    series,
    count,
    isComplete,
    onNearEnd,
    coverUrl,
    usesStandIns,
    listId,
    activeKey,
    onRevealReady,
    onOpen,
    words,
    view,
  }: {
    series: readonly LibrarySeries[];
    count: number | undefined;
    isComplete: boolean;
    onNearEnd: () => void;
    coverUrl: CoverUrl;
    usesStandIns: boolean;
    listId: string;
    activeKey: string | undefined;
    onRevealReady?: ((reveal: Reveal) => void) | undefined;
    onOpen: (series: LibrarySeries) => void;
    words: string;
    view: LibraryView | undefined;
  } = $props();

  const TODAYS_TITLE = "truncate text-lead font-semibold large:text-small";
  const NATIVE_TITLE =
    "truncate text-native-row-title/native-row-title font-native-row-title tracking-native-row-title";
  const TODAYS_LINE = "text-caption text-muted";
  const NATIVE_LINE = `${ROW_SUBTITLE_TYPE} text-muted`;
  const TODAYS_HEADING = "font-semibold";
  const TODAYS_MARK = "rounded-badge bg-chip text-foreground";
  const NATIVE_MARK = "rounded-none bg-native-accent-soft text-inherit";

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isNative = $derived(phoneOf(platform, width.current) === "ios");
  const lookOf = $derived(usesStandIns ? standInLook : realLook);

  const headingId = $props.id();
  const locale = getLocale();
  const numbers = $derived(new Intl.NumberFormat(locale));
  const hasWords = $derived(words.trim() !== "");
  const coversTrack = $derived(
    view === undefined || view.fitsCoversToWidth
      ? "large:grid-cols-covers-fit"
      : "large:grid-cols-covers-per-row",
  );
  const coversPerRow = $derived(
    view === undefined
      ? undefined
      : SCREEN_SIZES.map(
          (size) =>
            `--${size}-covers-per-row: ${String(view.coversPerRow[size])}`,
        ).join("; "),
  );
</script>

{#snippet found(one: LibrarySeries)}
  {@const shown = lookOf(one)}
  <ListCover
    cover={shown.cover}
    {coverUrl}
    class="rounded-result-cover inline-result-cover large:box-border large:rounded-cover large:inline-full"
  />
  <div class="flex flex-col gap-2xs min-inline-none">
    <p class={isNative ? NATIVE_TITLE : TODAYS_TITLE}>
      {#each matchedWords(shown.title, words, locale) as part, index (index)}
        {#if part.isMatch}
          <mark class={isNative ? NATIVE_MARK : TODAYS_MARK}>{part.text}</mark>
        {:else}
          {part.text}
        {/if}
      {/each}
    </p>
    {#if hasWords}
      <p class={isNative ? NATIVE_LINE : TODAYS_LINE}>
        {m.search_matched_title()}
      </p>
    {/if}
    <p class={isNative ? NATIVE_LINE : TODAYS_LINE}>
      {m.library_series_books({ count: one.bookCount })}
    </p>
  </div>
{/snippet}

<section
  aria-labelledby={headingId}
  class="flex flex-col gap-sm large:gap-label"
>
  <h2
    id={headingId}
    class={isNative ? GROUPED_GROUP_LOOK.heading : TODAYS_HEADING}
  >
    {count === undefined
      ? m.quick_open_series()
      : m.search_series_heading({ count: numbers.format(count) })}
  </h2>
  <VirtualGrid
    {onRevealReady}
    items={series}
    key={(one: LibrarySeries) => one.id}
    label={m.search_results()}
    {isComplete}
    {onNearEnd}
    class={[
      "grid-cols-1 gap-sm large:covers-gap-xl large:covers-row-gap-cover-row-wide",
      coversTrack,
    ]}
    {...coversPerRow === undefined ? {} : { style: coversPerRow }}
    itemClass="flex cursor-default items-center gap-md rounded-card min-inline-none aria-selected:bg-accent-soft large:flex-col large:items-stretch large:gap-sm large:rounded-cover large:aria-selected:bg-transparent large:aria-selected:outline-2 large:aria-selected:outline-offset-4 large:aria-selected:outline-accent"
    cell={found}
    listbox={{ id: listId, activeKey, onChoose: onOpen }}
  />
</section>
