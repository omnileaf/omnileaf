<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { commands, type LibrarySearch } from "#lib/ipc/bindings.ts";
  import { coverUrl } from "#lib/library/cover-url.ts";
  import { listenForLibraryChanges } from "#lib/library/library-changes.ts";
  import {
    type FilterCondition,
    filtersOn,
  } from "#lib/library/library-listing.ts";
  import { LibrarySeriesList } from "#lib/library/library-series.svelte.ts";
  import { LibrarySeriesCount } from "#lib/library/library-series-count.svelte.ts";
  import { SECTION_ROUTE_IDS } from "#lib/navigation/sections.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import ConditionChips from "#lib/search/ConditionChips.svelte";
  import { filterWords } from "#lib/search/condition-labels.ts";
  import KeyHints from "#lib/search/KeyHints.svelte";
  import NothingFound from "#lib/search/NothingFound.svelte";
  import { SEARCH_QUERY_PARAMETER } from "#lib/search/search-route.ts";
  import SearchField from "#lib/search/SearchField.svelte";
  import { SearchQuery } from "#lib/search/search-query.svelte.ts";
  import SearchResults from "#lib/search/SearchResults.svelte";
  import SearchStart from "#lib/search/SearchStart.svelte";
  import ShowChoices from "#lib/search/ShowChoices.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();

  const query = new SearchQuery(filterWords(), getLocale());
  const asked = $derived(
    page.url.searchParams.get(SEARCH_QUERY_PARAMETER) ?? "",
  );

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

  function lookAgain(): void {
    void results.start();
    void found.load();
  }

  function startOver(text: string): void {
    query.clearConditions();
    query.type(text);
  }

  $effect.pre(() => {
    const text = asked;
    untrack(() => {
      startOver(text);
    });
  });

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
    />
    <a
      href={resolve(SECTION_ROUTE_IDS.library)}
      class="flex shrink-0 items-center px-search-cancel-inline text-body font-semibold text-accent block-search-cancel medium:rounded-field medium:px-md medium:text-small medium:block-pointer-button"
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
      />
    {/if}
  {/if}
  <KeyHints platform={data.appInfo.platform} class="mbs-auto" />
</div>
