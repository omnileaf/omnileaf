<script lang="ts">
  import { ButtonGroup } from "#lib/components/ui/button-group/index.ts";
  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";
  import type { LibrarySort, LibrarySortBy } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SORTS } from "./library-listing";
  import { SORT_LABELS } from "./sort-labels";
  import SortDirectionButton from "./SortDirectionButton.svelte";

  let {
    sort,
    onSortBy,
    onReverse,
  }: {
    sort: LibrarySort;
    onSortBy: (by: LibrarySortBy) => void;
    onReverse: () => void;
  } = $props();

  const labelId = $props.id();

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

<div
  class="grid grid-cols-setting-grid items-center gap-x-md py-setting-grid-pad min-block-setting-grid-row"
>
  <span id={labelId} class="text-small font-medium">
    {m.library_sort_by()}
  </span>
  <ButtonGroup aria-labelledby={labelId} class="inline-setting-control">
    <NativeSelect
      aria-labelledby={labelId}
      value={sort.by}
      class="flex-1 min-inline-none"
      fieldClass="touch:text-body touch:block-touch-target"
      onchange={chooseSort}
    >
      {#each SORTS as by (by)}
        <option value={by}>{SORT_LABELS[by]()}</option>
      {/each}
    </NativeSelect>
    <SortDirectionButton {sort} look="icon" {onReverse} />
  </ButtonGroup>
</div>
