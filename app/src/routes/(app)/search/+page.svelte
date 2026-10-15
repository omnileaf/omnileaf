<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbPage,
    BreadcrumbSeparator,
  } from "#lib/components/ui/breadcrumb/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import {
    commands,
    type LibrarySearch,
    DEFAULT_LIBRARY_VIEW,
    type LibrarySeries,
    type LibraryView,
    type Platform,
    type SpellingSuggestion,
  } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import {
    type FilterCondition,
    filtersOn,
  } from "#lib/library/library-listing.ts";
  import { librarySeriesList } from "#lib/library/library-series.svelte.ts";
  import { LibrarySeriesCount } from "#lib/library/library-series-count.svelte.ts";
  import { StoredChoice } from "#lib/library/stored-choice.svelte.ts";
  import { SECTION_ROUTE_IDS } from "#lib/navigation/sections.ts";
  import {
    EXPANDED_QUERY,
    NARROW_POINTER_QUERY,
  } from "#lib/page/breakpoints.ts";
  import PageToolbar from "#lib/page/PageToolbar.svelte";
  import { browserPreferenceStore } from "#lib/preferences/stored-preference.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { getScreenshotMode } from "#lib/screenshot-mode/screenshot-mode.svelte.ts";
  import ConditionChips from "#lib/search/ConditionChips.svelte";
  import { filterWords } from "#lib/search/condition-labels.ts";
  import KeyHints from "#lib/search/KeyHints.svelte";
  import NothingFound from "#lib/search/NothingFound.svelte";
  import { nothingFoundTitle } from "#lib/search/nothing-found.ts";
  import { searchTextIn } from "#lib/search/search-route.ts";
  import SearchField from "#lib/search/SearchField.svelte";
  import {
    SearchQuery,
    type SearchScope,
  } from "#lib/search/search-query.svelte.ts";
  import { RecentSearches } from "#lib/search/recent-searches.svelte.ts";
  import SearchResults from "#lib/search/SearchResults.svelte";
  import SearchStart from "#lib/search/SearchStart.svelte";
  import ScopeChips from "#lib/search/ScopeChips.svelte";
  import {
    columnsOf,
    movedTo,
    optionId,
    type Reveal,
  } from "#lib/virtual-grid/grid-keys.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const screenshotMode = getScreenshotMode();
  const recent = new RecentSearches(browserPreferenceStore());
  const libraryView = new StoredChoice<LibraryView>(
    {
      read: () => commands.libraryView(),
      store: (chosen: LibraryView) => commands.setLibraryView(chosen),
      fallback: DEFAULT_LIBRARY_VIEW,
    },
    (error) => {
      reportError(error);
    },
  );
  const BACK_ICON_SIZE = 22;
  const DESKTOPS: readonly Platform[] = ["linux", "macos", "windows"];
  const isWide = new MediaQuery(EXPANDED_QUERY);
  const isNarrowPointer = new MediaQuery(NARROW_POINTER_QUERY);
  const hasToolbar = $derived(
    DESKTOPS.includes(data.appInfo.platform) &&
      (isWide.current || isNarrowPointer.current),
  );

  const query = new SearchQuery(filterWords(), getLocale());

  const results = librarySeriesList((after) =>
    commands.librarySearch(after, query.search),
  );
  const found = new LibrarySeriesCount(
    () => commands.librarySearchCount(query.search),
    (error) => {
      reportError(error);
    },
  );

  const isLookingFor = $derived(hasSomethingToFind(query.search));
  /** The search as typed with its edges trimmed, so a space after the words changes nothing. */
  const searchKey = $derived(JSON.stringify(query.search));
  let answeredKey: string | undefined = $state();
  let latestLook = 0;
  const isAnswered = $derived(answeredKey === searchKey);
  let suggestion = $state<{
    readonly key: string;
    readonly found: SpellingSuggestion | null;
  }>();
  const shownSuggestion = $derived(
    suggestion?.key === searchKey ? suggestion.found : null,
  );
  $effect(() => {
    const text = query.search.text;
    if (
      !isAnswered ||
      text === "" ||
      results.list.kind !== "loaded" ||
      results.list.items.length > 0
    ) {
      return;
    }
    const key = searchKey;
    void commands.librarySpellingSuggestion(text).then((likely) => {
      suggestion = { key, found: likely.status === "ok" ? likely.data : null };
    });
  });
  const announcement = $derived.by(() => {
    if (!isLookingFor) {
      return "";
    }
    if (results.list.kind === "failed") {
      return m.search_failed();
    }
    if (!isAnswered || results.list.kind !== "loaded") {
      return "";
    }
    if (results.list.items.length === 0) {
      return nothingFoundTitle(query.search.text);
    }
    return found.count === undefined
      ? ""
      : m.search_found({ count: found.count });
  });
  const listId = $props.id();
  let activeKey: string | undefined = $state();
  let drawnKey: string | undefined = $state();
  let revealResult: Reveal | undefined = $state();
  const shown: readonly LibrarySeries[] = $derived(
    results.list.kind === "loaded" ? results.list.items : [],
  );
  const activeIndex = $derived.by(() => {
    const index = shown.findIndex((series) => series.id === activeKey);
    return index === -1 ? undefined : index;
  });
  const activeSeries = $derived(
    activeIndex === undefined ? undefined : shown[activeIndex],
  );

  function hasSomethingToFind(search: LibrarySearch): boolean {
    return search.text !== "" || filtersOn(search.filter) > 0;
  }

  function type(typed: string): void {
    query.type(typed);
  }

  function toggle(condition: FilterCondition): void {
    query.toggle(condition);
  }

  function close(): void {
    void goto(resolve(SECTION_ROUTE_IDS.library));
  }

  function rememberSearch(): void {
    const words = filterWords();
    recent.remember(
      [...query.conditions.map((condition) => words[condition]), query.text]
        .join(" ")
        .trim(),
      Date.now(),
    );
  }

  function open(series: LibrarySeries): void {
    rememberSearch();
    void goto(resolve("/(app)/series/[id]", { id: series.id }));
  }

  function choose(series: LibrarySeries): void {
    if (!isAnswered) {
      return;
    }
    activeKey = series.id;
    open(series);
  }

  /** Names the result active to the field only once it is drawn, so the field never points at a result the list has yet to draw. */
  async function reveal(series: LibrarySeries, index: number): Promise<void> {
    const drawn = await revealResult?.(index);
    if (drawn !== undefined && activeKey === series.id) {
      drawnKey = series.id;
    }
  }

  function navigate(event: KeyboardEvent): boolean {
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return false;
    }
    const { key } = event;
    if (!isAnswered) {
      return false;
    }
    if (key === "Enter") {
      if (activeSeries !== undefined) {
        open(activeSeries);
      }
      return activeSeries !== undefined;
    }
    const list = document.getElementById(listId);
    const next = movedTo(key, activeIndex, {
      count: shown.length,
      columns: list === null ? 1 : columnsOf(list),
    });
    if (next === undefined) {
      return false;
    }
    const series = shown[next];
    if (series === undefined) {
      return false;
    }
    activeKey = series.id;
    void reveal(series, next);
    return true;
  }

  async function lookAgain(key: string): Promise<void> {
    activeKey = undefined;
    const look = ++latestLook;
    void found.load();
    await results.start();
    if (look === latestLook) {
      answeredKey = key;
    }
  }

  /** Reads the whole address rather than its query, so arriving at the same one again still starts over. */
  function startOverOnArrival(): void {
    const arrival = page.url;
    untrack(() => {
      query.startOver(searchTextIn(arrival));
    });
  }

  $effect.pre(startOverOnArrival);

  $effect(() => {
    const key = searchKey;
    if (untrack(() => isLookingFor)) {
      untrack(() => {
        void lookAgain(key);
      });
    }
  });

  onMount(() => {
    void libraryView.load();
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

{#if hasToolbar}
  <PageToolbar>
    <Breadcrumb
      aria-label={m.series_breadcrumb()}
      class="flex items-center text-small text-muted min-inline-none"
    >
      <BreadcrumbItem>
        <a
          href={resolve(SECTION_ROUTE_IDS.library)}
          data-back-link
          class="transition-control hover:text-foreground"
        >
          {m.library_title()}
        </a>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbPage class="text-foreground">
          {m.search_title()}
        </BreadcrumbPage>
      </BreadcrumbItem>
    </Breadcrumb>
  </PageToolbar>
{/if}
<div
  class={[
    "flex flex-col gap-search-gap min-block-full",
    hasToolbar && "pbs-xl",
  ]}
>
  <h1 class="sr-only">{m.search_title()}</h1>
  <p role="status" class="sr-only">{announcement}</p>
  <div class="flex items-center gap-sm large:gap-md">
    {#if !hasToolbar}
      <Tooltip label={m.search_back()}>
        {#snippet child({ props })}
          <a
            {...props}
            href={resolve(SECTION_ROUTE_IDS.library)}
            aria-label={m.search_back()}
            data-back-link
            class="flex shrink-0 items-center justify-center rounded-full transition-control block-touch-target inline-touch-target hover:tint-hover active:tint-pressed"
          >
            <ArrowLeft
              size={BACK_ICON_SIZE}
              aria-hidden="true"
              class="rtl:-scale-x-100"
            />
          </a>
        {/snippet}
      </Tooltip>
    {/if}
    <SearchField
      text={query.text}
      conditions={query.conditions}
      onType={type}
      onRemove={toggle}
      onEscape={close}
      {listId}
      activeId={activeSeries === undefined || drawnKey !== activeSeries.id
        ? undefined
        : optionId(listId, activeSeries.id)}
      hasChoices={shown.length > 0}
      onKey={navigate}
    />
  </div>
  {#if !isLookingFor}
    <SearchStart
      recent={recent.entries}
      nowMs={Date.now()}
      onRun={type}
      onClear={() => {
        recent.clear();
      }}
    />
  {:else}
    {#if query.conditions.length > 0}
      <ConditionChips
        conditions={query.conditions}
        onRemove={toggle}
        look="row"
        class="medium:hidden"
      />
    {/if}
    <ScopeChips
      scope={query.scope}
      onNarrow={(scope: SearchScope) => {
        query.narrowTo(scope);
      }}
    />
    {#if results.list.kind === "failed"}
      <p class="text-body text-muted">{m.search_failed()}</p>
    {:else if results.list.kind === "loaded" && results.list.items.length === 0}
      {#if isAnswered}
        <NothingFound
          text={query.search.text}
          suggestion={shownSuggestion}
          onSuggest={(text: string) => {
            query.type(text);
          }}
        />
      {/if}
    {:else if results.list.kind === "loaded"}
      <SearchResults
        onRevealReady={(reveal: Reveal) => {
          revealResult = reveal;
        }}
        series={results.list.items}
        count={found.count}
        isComplete={results.list.isComplete}
        onNearEnd={() => {
          void results.loadMore();
        }}
        {coverUrl}
        usesStandIns={screenshotMode.isOn}
        {listId}
        activeKey={activeSeries?.id}
        onOpen={choose}
        words={query.search.text}
        view={libraryView.reading.kind === "read"
          ? libraryView.reading.value
          : undefined}
      />
    {/if}
  {/if}
  <KeyHints platform={data.appInfo.platform} class="mbs-auto" />
</div>
