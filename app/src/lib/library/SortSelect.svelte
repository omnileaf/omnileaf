<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";

  import { ButtonGroup } from "#lib/components/ui/button-group/index.ts";
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import type { LibrarySort, LibrarySortBy } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { MAC_INSPECTOR } from "./filter-sheet-look";
  import { GROUPED_FOOTNOTE_TYPE } from "./group-look";
  import { SORTS } from "./library-listing";
  import { SORT_LABELS } from "./sort-labels";
  import SortDirectionButton from "./SortDirectionButton.svelte";

  let {
    sort,
    isInspector = false,
    onSortBy,
    onReverse,
  }: {
    sort: LibrarySort;
    isInspector?: boolean;
    onSortBy: (by: LibrarySortBy) => void;
    onReverse: () => void;
  } = $props();

  const platform = currentPlatform();
  const width = new WindowWidth();
  const isAndroidPhone = $derived(
    phoneOf(platform, width.current) === "android",
  );
  const labelId = $props.id();
  const footnoteId = `${labelId}-footnote`;
  const isTimedSort = $derived(sort.by === "timeLeft");

  function isSort(value: string): value is LibrarySortBy {
    return SORTS.some((by) => by === value);
  }

  function chooseSort({
    currentTarget: { value },
  }: Event & { currentTarget: HTMLSelectElement }) {
    if (isSort(value)) {
      onSortBy(value);
    }
  }
</script>

{#if isAndroidPhone}
  <div class="flex items-center gap-sm px-lg py-sm">
    <div class="relative flex-1 min-inline-none">
      <span
        id={labelId}
        class={[
          "pointer-events-none absolute inset-s-md inset-bs-none -translate-y-1/2 bg-native-sheet px-xs text-muted",
          GROUPED_FOOTNOTE_TYPE,
        ]}
      >
        {m.library_sort_by()}
      </span>
      <select
        aria-labelledby={labelId}
        aria-describedby={isTimedSort ? footnoteId : undefined}
        value={sort.by}
        class="appearance-none rounded-native-outlined-field border border-native-button-outline-edge bg-transparent ps-lg pe-select-end text-body text-ellipsis block-native-outlined-field inline-full"
        onchange={chooseSort}
      >
        {#each SORTS as by (by)}
          <option value={by}>{SORT_LABELS[by]()}</option>
        {/each}
      </select>
      <ChevronDown
        size={24}
        aria-hidden="true"
        class="pointer-events-none absolute inset-e-md inset-bs-1/2 inset-be-auto -translate-y-1/2 text-muted"
      />
    </div>
    <SortDirectionButton {sort} look="material" {onReverse} />
  </div>
{:else}
  <div
    class={isInspector
      ? "flex flex-col gap-sm"
      : "grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row"}
  >
    <span
      id={labelId}
      class={isInspector ? MAC_INSPECTOR.label : "text-small font-medium"}
    >
      {m.library_sort_by()}
    </span>
    <ButtonGroup
      aria-labelledby={labelId}
      class={isInspector ? "gap-sm inline-full" : "inline-setting-control"}
    >
      <NativeSelect
        aria-labelledby={labelId}
        aria-describedby={isTimedSort ? footnoteId : undefined}
        value={sort.by}
        class="flex-1 min-inline-none"
        {...isInspector
          ? MAC_INSPECTOR.select
          : { fieldClass: "touch:text-body touch:block-touch-target" }}
        onchange={chooseSort}
      >
        {#each SORTS as by (by)}
          <option value={by}>{SORT_LABELS[by]()}</option>
        {/each}
      </NativeSelect>
      <SortDirectionButton
        {sort}
        look={isInspector ? "inspector" : "icon"}
        {onReverse}
      />
    </ButtonGroup>
  </div>
{/if}
{#if isTimedSort}
  <p id={footnoteId} class="pbe-setting-grid-pad text-detail text-muted">
    {m.library_sort_time_left_footnote()}
  </p>
{/if}
