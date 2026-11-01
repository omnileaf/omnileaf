<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { ROW_SUBTITLE_TYPE } from "#lib/components/ui/item/looks.ts";
  import type {
    Inclusion,
    LibraryFilterChoices,
    LibraryListing,
    LibrarySortBy,
    SmartFilter,
  } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";
  import SettingChoice from "#lib/reader/SettingChoice.svelte";

  import {
    FORMAT_LABELS,
    languageName,
    READ_STATE_LABELS,
  } from "./filter-labels";
  import {
    ANDROID_FILTER_CHIP,
    ANDROID_FILTER_HEADING,
    MAC_INSPECTOR,
  } from "./filter-sheet-look";
  import FilterSetting from "./FilterSetting.svelte";
  import FilterToggles from "./FilterToggles.svelte";
  import { GROUPED_FOOTNOTE, groupLook } from "./group-look";
  import {
    type ChosenFrom,
    type IncludedBy,
    type ReadState,
    READ_STATES,
    readStateOf,
    reversed,
    SORTS,
    sortedBy,
    toggledIn,
    withInclusion,
    withReadState,
  } from "./library-listing";
  import SmartFilterRows from "./SmartFilterRows.svelte";
  import PickerRow from "./PickerRow.svelte";
  import ReadStateChoice from "./ReadStateChoice.svelte";
  import { directionWordings, SORT_LABELS } from "./sort-labels";
  import SortSelect from "./SortSelect.svelte";

  const TAGS_AT_FIRST = 3;
  const PLUS_SIZE = 14;
  const INCLUSION_LABELS = {
    any: m.library_filter_any,
    only: m.library_filter_only,
    hide: m.library_filter_hide,
  } satisfies Record<Inclusion, () => string>;

  const ADULT_INCLUSIONS: readonly Inclusion[] = ["any", "only", "hide"];
  const BOOKMARK_INCLUSIONS: readonly Inclusion[] = ["any", "only"];

  let {
    listing,
    choices,
    onChoose,
    isGrouped = false,
    isInspector = false,
  }: {
    listing: LibraryListing;
    choices: LibraryFilterChoices;
    onChoose: (listing: LibraryListing) => void;
    isGrouped?: boolean;
    isInspector?: boolean;
  } = $props();

  const width = new WindowWidth();
  const isAndroidPhone = $derived(
    phoneOf(currentPlatform(), width.current) === "android",
  );
  const look = $derived(groupLook(isGrouped));

  function headingClassOf(): string {
    if (isAndroidPhone) {
      return ANDROID_FILTER_HEADING;
    }
    return isInspector ? MAC_INSPECTOR.heading : look.heading;
  }

  function sectionClassOf(isFilter: boolean): string | false {
    if (isInspector) {
      return MAC_INSPECTOR.section;
    }
    if (isGrouped) {
      return look.section;
    }
    return isFilter && !isAndroidPhone && "pbs-lg";
  }

  const headingClass = $derived(headingClassOf());
  const sortByOptions = $derived(
    SORTS.map((by) => ({ value: by, label: SORT_LABELS[by]() })),
  );
  const directionOptions = $derived(
    (["ascending", "descending"] as const).map((direction, index) => ({
      value: direction,
      label: directionWordings(listing.sort.by)[index]?.label() ?? "",
    })),
  );
  const readStateOptions = $derived(
    READ_STATES.map((state) => ({
      value: state,
      label: READ_STATE_LABELS[state](),
    })),
  );
  const timeLeftNoteId = $props.id();

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

<section class={["flex flex-col", sectionClassOf(false)]}>
  <h3 class={headingClass}>{m.library_sort()}</h3>
  {#if isGrouped}
    <div class={look.group}>
      <PickerRow
        label={m.library_sort_by()}
        options={sortByOptions}
        describedBy={listing.sort.by === "timeLeft"
          ? timeLeftNoteId
          : undefined}
        value={listing.sort.by}
        onChoose={(value: string) => {
          const by = SORTS.find((sort) => sort === value);
          if (by !== undefined) {
            onChoose(sortedBy(listing, by));
          }
        }}
      />
      <PickerRow
        label={m.library_sort_order()}
        options={directionOptions}
        value={listing.sort.direction}
        onChoose={(value: string) => {
          if (value !== listing.sort.direction) {
            onChoose(reversed(listing));
          }
        }}
      />
    </div>
    {#if listing.sort.by === "timeLeft"}
      <p id={timeLeftNoteId} class={GROUPED_FOOTNOTE}>
        {m.library_sort_time_left_footnote()}
      </p>
    {/if}
  {:else}
    <SortSelect
      sort={listing.sort}
      {isInspector}
      onSortBy={(by: LibrarySortBy) => {
        onChoose(sortedBy(listing, by));
      }}
      onReverse={() => {
        onChoose(reversed(listing));
      }}
    />
  {/if}
</section>
<section class={["flex flex-col", sectionClassOf(true)]}>
  <h3 class={headingClass}>{m.library_filter()}</h3>
  <div class={isAndroidPhone ? "flex flex-col" : look.group}>
    {#if isGrouped}
      <PickerRow
        label={m.library_read_state()}
        options={readStateOptions}
        value={readStateOf(listing.filter)}
        onChoose={(value: string) => {
          const state = READ_STATES.find((candidate) => candidate === value);
          if (state !== undefined) {
            onChoose(withReadState(listing, state));
          }
        }}
      />
    {:else if isAndroidPhone}
      <FilterSetting
        label={m.library_read_state()}
        options={READ_STATES}
        labels={READ_STATE_LABELS}
        chosen={readStateOf(listing.filter)}
        onChoose={(state: ReadState) => {
          onChoose(withReadState(listing, state));
        }}
      />
    {:else}
      <ReadStateChoice
        filter={listing.filter}
        {isInspector}
        onChoose={(state: ReadState) => {
          onChoose(withReadState(listing, state));
        }}
      />
    {/if}
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
            class={isAndroidPhone
              ? [
                  ANDROID_FILTER_CHIP.chip,
                  ANDROID_FILTER_CHIP.other,
                  "text-native-on-button-plain",
                ]
              : "flex items-center gap-xs rounded-control px-md text-small font-medium block-search-chip ios:max-medium:rounded-full ios:max-medium:border-0 ios:max-medium:bg-native-button-outline ios:max-medium:block-native-segment touch:touch-target-around"}
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
    {#if choices.ratesAdult && isAndroidPhone}
      <FilterSetting
        isRow
        label={m.library_filter_adult()}
        hint={m.library_filter_adult_hint()}
        options={ADULT_INCLUSIONS}
        labels={INCLUSION_LABELS}
        chosen={listing.filter.adult}
        onChoose={(inclusion: Inclusion) => {
          include("adult", inclusion);
        }}
      />
    {:else if choices.ratesAdult}
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
    {#if choices.keepsBookmarks && isAndroidPhone}
      <FilterSetting
        isRow
        label={m.library_filter_bookmarked()}
        hint={m.library_filter_bookmarked_hint()}
        options={BOOKMARK_INCLUSIONS}
        labels={INCLUSION_LABELS}
        chosen={listing.filter.bookmarked}
        onChoose={(inclusion: Inclusion) => {
          include("bookmarked", inclusion);
        }}
      />
    {:else if choices.keepsBookmarks}
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
    {#if isAndroidPhone && choices.smart.length > 0}
      <div class="flex flex-col">
        <h3 class={ANDROID_FILTER_HEADING}>{m.library_smart_filters()}</h3>
        <p class="{ROW_SUBTITLE_TYPE} ps-lg pe-xl pbe-sm text-muted">
          {m.library_smart_filters_hint()}
        </p>
        <SmartFilterRows
          isMaterial
          offered={choices.smart}
          chosen={listing.filter.smart}
          onToggle={(smart: SmartFilter) => {
            toggle("smart", smart);
          }}
        />
        {#if !choices.smart.includes("readyToCleanUp")}
          <p class="{ROW_SUBTITLE_TYPE} ps-lg pe-xl pbs-sm pbe-lg text-muted">
            {m.library_smart_clean_up_waits()}
          </p>
        {/if}
      </div>
    {:else if !isGrouped && choices.smart.length > 0}
      <div class="flex flex-col">
        <div class="flex flex-col gap-2xs pbs-setting-grid-pad">
          <p class="text-small font-semibold">{m.library_smart_filters()}</p>
          <p class="text-detail text-muted">
            {m.library_smart_filters_hint()}
          </p>
        </div>
        <div class="flex flex-col divide-y divide-border">
          <SmartFilterRows
            offered={choices.smart}
            chosen={listing.filter.smart}
            onToggle={(smart: SmartFilter) => {
              toggle("smart", smart);
            }}
          />
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
{#if isGrouped && choices.smart.length > 0}
  <section class={["flex flex-col", look.section]}>
    <h3 class={look.heading}>{m.library_smart_filters()}</h3>
    <div class={look.group}>
      <SmartFilterRows
        offered={choices.smart}
        chosen={listing.filter.smart}
        onToggle={(smart: SmartFilter) => {
          toggle("smart", smart);
        }}
      />
    </div>
    <p class={GROUPED_FOOTNOTE}>{m.library_smart_filters_hint()}</p>
    {#if !choices.smart.includes("readyToCleanUp")}
      <p class={GROUPED_FOOTNOTE}>
        {m.library_smart_clean_up_waits()}
      </p>
    {/if}
  </section>
{/if}
