<script lang="ts">
  import { onMount, tick, untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import {
    commands,
    type LibrarySearch,
    type LibrarySeries,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import {
    type FilterCondition,
    filtersOn,
  } from "#lib/library/library-listing.ts";
  import { LibrarySeriesList } from "#lib/library/library-series.svelte.ts";
  import { realLook, standInLook } from "#lib/library/series-look.ts";
  import { LibrarySeriesCount } from "#lib/library/library-series-count.svelte.ts";
  import { SECTION_ROUTE_IDS } from "#lib/navigation/sections.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import ConditionChips from "#lib/search/ConditionChips.svelte";
  import { filterWords } from "#lib/search/condition-labels.ts";
  import KeyHints from "#lib/search/KeyHints.svelte";
  import NothingFound from "#lib/search/NothingFound.svelte";
  import { searchAskedIn, titleQuery } from "#lib/search/search-route.ts";
  import SearchField from "#lib/search/SearchField.svelte";
  import { SearchQuery } from "#lib/search/search-query.svelte.ts";
  import SearchResults from "#lib/search/SearchResults.svelte";
  import SearchStart from "#lib/search/SearchStart.svelte";
  import ShowChoices from "#lib/search/ShowChoices.svelte";
  import { columnsOf, movedTo, optionId } from "#lib/virtual-grid/grid-keys.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();

  const query = new SearchQuery(filterWords(), getLocale());

  const results = new LibrarySeriesList((after) =>
    commands.librarySearch(after, query.search),
  );
  const found = new LibrarySeriesCount(
    () => commands.librarySearchCount(query.search),
    (error) => {
      reportError(error);
    },
  );

  const isLookingFor = $derived(hasSomethingToFind(query.search));
  const listId = $props.id();
  let active: number | undefined = $state();
  const shown: readonly LibrarySeries[] = $derived(
    results.list.kind === "loaded" ? results.list.series : [],
  );
  const activeSeries = $derived(
    active === undefined ? undefined : shown[active],
  );
  const lookOf = $derived(screenshotMode.isOn ? standInLook : realLook);

  function hasSomethingToFind(search: LibrarySearch): boolean {
    return search.text !== "" || filtersOn(search.filter) > 0;
  }

  function type(typed: string): void {
    query.type(typed);
  }

  function toggle(condition: FilterCondition): void {
    query.toggle(condition);
  }

  function showEverything(): void {
    query.clearConditions();
  }

  function close(): void {
    void goto(resolve(SECTION_ROUTE_IDS.library));
  }

  /** Shows the series as quick open would, by its title, or its stand-in while Screenshot mode is on. */
  function open(series: LibrarySeries): void {
    void goto(`${resolve("/(app)/search")}${titleQuery(lookOf(series).title)}`);
  }

  function reveal(series: LibrarySeries): void {
    void tick().then(() => {
      document
        .getElementById(optionId(listId, series.id))
        ?.scrollIntoView({ block: "nearest" });
    });
  }

  /** Moves through the results, or opens the active one, for the keys they answer to. */
  function navigate(key: string): boolean {
    if (key === "Enter") {
      if (activeSeries !== undefined) {
        open(activeSeries);
      }
      return activeSeries !== undefined;
    }
    const list = document.getElementById(listId);
    const next = movedTo(key, active, {
      count: shown.length,
      columns: list === null ? 1 : columnsOf(list),
    });
    const series = next === undefined ? undefined : shown[next];
    if (series === undefined) {
      return false;
    }
    active = next;
    reveal(series);
    return true;
  }

  function lookAgain(): void {
    active = undefined;
    void results.start();
    void found.load();
  }

  /** Reads the whole address rather than its query, so arriving at the same one again still starts over. */
  function startOverOnArrival(): void {
    const arrival = page.url;
    untrack(() => {
      query.startOver(searchAskedIn(arrival));
    });
  }

  $effect.pre(startOverOnArrival);

  $effect(() => {
    if (hasSomethingToFind(query.search)) {
      untrack(lookAgain);
    }
  });

  onMount(() =>
    listenForLibraryChanges(() => {
      if (isLookingFor) {
        void results.load();
        void found.load();
      }
    }, reportError),
  );
</script>

<div class="flex flex-col gap-search-gap min-block-full">
  <h1 class="sr-only">{m.search_title()}</h1>
  <div class="flex items-center gap-sm large:gap-md">
    <SearchField
      text={query.text}
      conditions={query.conditions}
      onType={type}
      onRemove={toggle}
      onEscape={close}
      {listId}
      activeId={activeSeries === undefined
        ? undefined
        : optionId(listId, activeSeries.id)}
      hasChoices={shown.length > 0}
      onKey={navigate}
    />
    <a
      href={resolve(SECTION_ROUTE_IDS.library)}
      class="flex shrink-0 items-center px-search-cancel-inline text-body font-semibold text-accent block-search-cancel medium:rounded-field medium:px-md medium:text-small medium:block-pointer-target"
    >
      <span class="medium:hidden">{m.search_cancel()}</span>
      <span class="hidden medium:inline">{m.search_close()}</span>
    </a>
  </div>
  {#if !isLookingFor}
    <SearchStart />
  {:else}
    {#if query.conditions.length > 0}
      <ConditionChips
        conditions={query.conditions}
        onRemove={toggle}
        look="row"
        class="medium:hidden"
      />
    {/if}
    <ShowChoices
      conditions={query.conditions}
      onToggle={toggle}
      onEverything={showEverything}
      class={[query.conditions.length > 0 && "max-medium:hidden"]}
    />
    {#if results.list.kind === "failed"}
      <p class="text-body text-muted">{m.search_failed()}</p>
    {:else if results.list.kind === "loaded" && results.list.series.length === 0}
      <NothingFound text={query.search.text} />
    {:else if results.list.kind === "loaded"}
      <SearchResults
        series={results.list.series}
        count={found.count}
        isComplete={results.list.isComplete}
        onNearEnd={() => {
          void results.loadMore();
        }}
        {coverUrl}
        usesStandIns={screenshotMode.isOn}
        {listId}
        activeKey={activeSeries?.id}
      />
    {/if}
  {/if}
  <KeyHints platform={data.appInfo.platform} class="mbs-auto" />
</div>
