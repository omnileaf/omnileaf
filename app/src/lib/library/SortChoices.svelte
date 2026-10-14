<script lang="ts">
  import {
    RadioGroup,
    RadioGroupItem,
  } from "#lib/components/ui/radio-group/index.ts";
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
</script>

<RadioGroup
  options={SORTS}
  chosen={sort.by}
  onChoose={onSortBy}
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
      <RadioGroupItem
        value={by}
        class="flex flex-1 items-center self-stretch text-start text-body"
      >
        <span class={sort.by === by ? "font-bold" : "font-medium"}>
          {SORT_LABELS[by]()}
        </span>
      </RadioGroupItem>
      {#if sort.by === by}
        <SortDirectionButton {sort} look="pill" {onReverse} />
      {/if}
    </div>
  {/each}
</RadioGroup>
