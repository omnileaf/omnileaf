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

<div class="flex flex-col gap-icon-gap">
  <span id={labelId} class="text-caption font-semibold text-muted">
    {m.library_sort_by()}
  </span>
  <ButtonGroup aria-labelledby={labelId}>
    <NativeSelect
      aria-labelledby={labelId}
      value={sort.by}
      class="flex-1"
      onchange={chooseSort}
    >
      {#each SORTS as by (by)}
        <option value={by}>{SORT_LABELS[by]()}</option>
      {/each}
    </NativeSelect>
    <SortDirectionButton {sort} look="field" {onReverse} />
  </ButtonGroup>
</div>
