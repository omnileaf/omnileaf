<script lang="ts">
  import { Book } from "@lucide/svelte";

  import { FILTER_CONDITIONS } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { CONDITION_HINTS, filterWords } from "./condition-labels";

  const KIND_ICON_SIZE = 17;

  const byId = $props.id();
  const filterId = `${byId}-filter`;
  const words = filterWords();
</script>

<div
  class="flex flex-col gap-section-gap pbs-md large:gap-xl large:pbs-icon-gap"
>
  <section aria-labelledby={byId} class="flex flex-col gap-sm large:gap-label">
    <h2 id={byId} class="text-lead font-bold">{m.search_by()}</h2>
    <ul
      class="overflow-hidden rounded-sheet-card border border-border bg-card large:grid large:grid-cols-5 large:gap-label large:overflow-visible large:rounded-none large:border-0 large:bg-transparent"
    >
      <li
        class="flex items-center gap-md px-search-kind-inline min-block-search-kind large:flex-col large:items-start large:gap-sm large:rounded-search-tile large:border large:border-border large:bg-card large:p-search-kind-inline"
      >
        <span
          class="flex shrink-0 items-center justify-center rounded-search-kind bg-accent-soft block-search-kind-icon inline-search-kind-icon large:rounded-search-kind-wide large:block-search-kind-icon-wide large:inline-search-kind-icon-wide"
        >
          <Book size={KIND_ICON_SIZE} aria-hidden="true" />
        </span>
        <span class="flex flex-col large:gap-sm">
          <span
            class="text-lead font-semibold large:text-small large:font-bold"
          >
            {m.search_by_title()}
          </span>
          <span class="text-caption text-muted">
            {m.search_by_title_example()}
          </span>
        </span>
      </li>
    </ul>
  </section>
  <section
    aria-labelledby={filterId}
    class="flex flex-col gap-sm large:gap-label"
  >
    <h2 id={filterId} class="text-lead font-bold">
      {m.search_type_to_filter()}
    </h2>
    <ul class="flex flex-wrap gap-icon-gap large:gap-sm">
      {#each FILTER_CONDITIONS as condition (condition)}
        <li
          class="inline-flex items-center gap-icon-gap rounded-field border border-border bg-card px-label text-caption text-muted block-hint-chip large:gap-sm large:px-md large:text-detail large:block-hint-chip-wide"
        >
          <code class="font-mono text-caption text-foreground">
            {words[condition]}
          </code>
          {CONDITION_HINTS[condition]()}
        </li>
      {/each}
    </ul>
  </section>
</div>
