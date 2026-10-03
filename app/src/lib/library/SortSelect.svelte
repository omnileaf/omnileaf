<script lang="ts">
  import { ChevronDown } from "@lucide/svelte";

  import type { LibrarySort, LibrarySortBy } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SORTS } from "./library-listing";
  import SortDirectionButton from "./SortDirectionButton.svelte";

  const LABELS = {
    title: m.library_sort_title,
    dateAdded: m.library_sort_date_added,
  } satisfies Record<LibrarySortBy, () => string>;

  const ICON_SIZE = 16;

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
</script>

<div class="flex flex-col gap-icon-gap">
  <span id={labelId} class="text-caption font-semibold text-muted">
    {m.library_sort_by()}
  </span>
  <div class="flex gap-sm">
    <div class="relative flex flex-1 items-center">
      <select
        aria-labelledby={labelId}
        value={sort.by}
        class="flex-1 appearance-none rounded-control border border-border bg-card ps-md pe-select-end text-detail font-medium block-panel-field"
        onchange={(event) => {
          const { value } = event.currentTarget;
          if (isSort(value)) {
            onSortBy(value);
          }
        }}
      >
        {#each SORTS as by (by)}
          <option value={by}>{LABELS[by]()}</option>
        {/each}
      </select>
      <ChevronDown
        size={ICON_SIZE}
        aria-hidden="true"
        class="pointer-events-none absolute inset-e-pill-inline text-muted"
      />
    </div>
    <SortDirectionButton {sort} look="field" {onReverse} />
  </div>
</div>
