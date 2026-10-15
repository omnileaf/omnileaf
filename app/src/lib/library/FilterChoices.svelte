<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import type {
    Inclusion,
    LibraryFilterChoices,
    LibraryListing,
    LibrarySortBy,
  } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingChoice from "#lib/reader/SettingChoice.svelte";

  import {
    FORMAT_LABELS,
    languageName,
    SMART_HINTS,
    SMART_LABELS,
  } from "./filter-labels";
  import FilterToggles from "./FilterToggles.svelte";
  import {
    type ChosenFrom,
    type IncludedBy,
    type ReadState,
    reversed,
    sortedBy,
    toggledIn,
    withInclusion,
    withReadState,
  } from "./library-listing";
  import ReadStateChoice from "./ReadStateChoice.svelte";
  import SortSelect from "./SortSelect.svelte";
  import ViewSwitchRow from "./ViewSwitchRow.svelte";

  const TAGS_AT_FIRST = 3;
  const PLUS_SIZE = 14;
  const INCLUSION_LABELS = {
    any: m.library_filter_any,
    only: m.library_filter_only,
    hide: m.library_filter_hide,
  } satisfies Record<Inclusion, () => string>;

  let {
    listing,
    choices,
    onChoose,
  }: {
    listing: LibraryListing;
    choices: LibraryFilterChoices;
    onChoose: (listing: LibraryListing) => void;
  } = $props();

  let showsEveryTag = $state(false);

  const tagsShown = $derived(
    showsEveryTag
      ? choices.tags
      : choices.tags.filter(
          (tag, index) =>
            index < TAGS_AT_FIRST || listing.filter.tags.includes(tag),
        ),
  );

  function toggle(key: ChosenFrom, value: string): void {
    onChoose(toggledIn(listing, key, value));
  }

  function include(key: IncludedBy, inclusion: Inclusion): void {
    onChoose(withInclusion(listing, key, inclusion));
  }

  function inclusions(offered: readonly Inclusion[]) {
    return offered.map((inclusion) => ({
      value: inclusion,
      label: INCLUSION_LABELS[inclusion](),
    }));
  }
</script>

<section class="flex flex-col">
  <h3 class="text-small font-semibold">{m.library_sort()}</h3>
  <SortSelect
    sort={listing.sort}
    onSortBy={(by: LibrarySortBy) => {
      onChoose(sortedBy(listing, by));
    }}
    onReverse={() => {
      onChoose(reversed(listing));
    }}
  />
</section>
<section class="flex flex-col pbs-lg">
  <h3 class="text-small font-semibold">{m.library_filter()}</h3>
  <div class="flex flex-col divide-y divide-border">
    <ReadStateChoice
      filter={listing.filter}
      onChoose={(state: ReadState) => {
        onChoose(withReadState(listing, state));
      }}
    />
    {#if choices.formats.length > 0}
      <FilterToggles
        label={m.library_filter_format()}
        options={choices.formats.map((format) => ({
          value: format,
          label: FORMAT_LABELS[format](),
        }))}
        chosen={listing.filter.formats}
        onToggle={(format: string) => {
          toggle("formats", format);
        }}
      />
    {/if}
    {#if choices.languages.length > 0}
      <FilterToggles
        label={m.library_filter_language()}
        options={choices.languages.map((language) => ({
          value: language,
          label: languageName(language),
        }))}
        chosen={listing.filter.languages}
        onToggle={(language: string) => {
          toggle("languages", language);
        }}
      />
    {/if}
    {#if choices.tags.length > 0}
      <FilterToggles
        label={m.library_filter_tags()}
        options={tagsShown.map((tag) => ({ value: tag, label: tag }))}
        chosen={listing.filter.tags}
        onToggle={(tag: string) => {
          toggle("tags", tag);
        }}
      >
        {#if tagsShown.length < choices.tags.length}
          <Button
            type="button"
            look="outline"
            class="flex items-center gap-xs rounded-control px-md text-small font-medium block-search-chip touch:touch-target-around"
            onclick={() => {
              showsEveryTag = true;
            }}
          >
            <Plus size={PLUS_SIZE} aria-hidden="true" />
            {m.library_more_tags()}
          </Button>
        {/if}
      </FilterToggles>
    {/if}
    {#if choices.ratesAdult}
      <SettingChoice
        label={m.library_filter_adult()}
        hint={m.library_filter_adult_hint()}
        choices={inclusions(["any", "only", "hide"])}
        chosen={listing.filter.adult}
        onChoose={(inclusion: Inclusion) => {
          include("adult", inclusion);
        }}
      />
    {/if}
    {#if choices.keepsBookmarks}
      <SettingChoice
        label={m.library_filter_bookmarked()}
        hint={m.library_filter_bookmarked_hint()}
        choices={inclusions(["any", "only"])}
        chosen={listing.filter.bookmarked}
        onChoose={(inclusion: Inclusion) => {
          include("bookmarked", inclusion);
        }}
      />
    {/if}
    {#if choices.smart.length > 0}
      <div class="flex flex-col">
        <div class="flex flex-col gap-2xs pbs-setting-grid-pad">
          <p class="text-small font-semibold">{m.library_smart_filters()}</p>
          <p class="text-detail text-muted">
            {m.library_smart_filters_hint()}
          </p>
        </div>
        <div class="flex flex-col divide-y divide-border">
          {#each choices.smart as smart (smart)}
            <ViewSwitchRow
              label={SMART_LABELS[smart]()}
              description={SMART_HINTS[smart]()}
              isOn={listing.filter.smart.includes(smart)}
              onToggle={() => {
                toggle("smart", smart);
              }}
            />
          {/each}
        </div>
        {#if !choices.smart.includes("readyToCleanUp")}
          <p
            class="border-bs border-border py-setting-grid-pad text-detail text-muted"
          >
            {m.library_smart_clean_up_waits()}
          </p>
        {/if}
      </div>
    {/if}
  </div>
</section>
