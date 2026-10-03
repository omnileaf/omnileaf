<script lang="ts">
  import type { LibrarySort, LibrarySortBy } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SORTS } from "./library-listing";
  import SortDirectionButton from "./SortDirectionButton.svelte";

  const LABELS = {
    title: m.library_sort_title,
    dateAdded: m.library_sort_date_added,
  } satisfies Record<LibrarySortBy, () => string>;

  let {
    sort,
    onSortBy,
    onReverse,
  }: {
    sort: LibrarySort;
    onSortBy: (by: LibrarySortBy) => void;
    onReverse: () => void;
  } = $props();

  const group = $props.id();
</script>

<div
  role="radiogroup"
  aria-label={m.library_sort()}
  class="flex flex-col px-md pbs-icon-gap pbe-sm"
>
  {#each SORTS as by (by)}
    <div
      class={[
        "flex items-center gap-sm rounded-field px-sm min-block-sort-row",
        sort.by === by && "bg-accent-soft",
      ]}
    >
      <label
        class="flex flex-1 cursor-pointer items-center self-stretch text-body has-focus-visible:outline-2 has-focus-visible:outline-accent"
      >
        <input
          type="radio"
          name={group}
          value={by}
          class="sr-only"
          checked={sort.by === by}
          onchange={() => {
            onSortBy(by);
          }}
        />
        <span class={sort.by === by ? "font-bold" : "font-medium"}>
          {LABELS[by]()}
        </span>
      </label>
      {#if sort.by === by}
        <SortDirectionButton {sort} look="pill" {onReverse} />
      {/if}
    </div>
  {/each}
</div>
