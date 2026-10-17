<script lang="ts">
  import { BookOpen, RotateCcwClock } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { FILTER_CONDITIONS } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { filterWords } from "./condition-labels";
  import { type RecentSearch, searchedWhen } from "./recent-searches.svelte";

  const ROW_ICON_SIZE = 16;

  let {
    recent,
    nowMs,
    onRun,
    onClear,
  }: {
    recent: readonly RecentSearch[];
    nowMs: number;
    onRun: (text: string) => void;
    onClear: () => void;
  } = $props();

  const id = $props.id();
  const recentId = `${id}-recent`;
  const byId = `${id}-by`;
  const filterId = `${id}-filter`;
  const words = filterWords();
  const locale = getLocale();
</script>

<div class="flex flex-col gap-section-gap pbs-md large:gap-xl">
  {#if recent.length > 0}
    <section aria-labelledby={recentId} class="flex flex-col gap-xs">
      <div class="flex items-center justify-between gap-sm">
        <h2 id={recentId} class="font-semibold">{m.search_recent()}</h2>
        <Button look="text" onclick={onClear}>
          {m.search_recent_clear()}
        </Button>
      </div>
      <ul class="flex flex-col divide-y divide-border">
        {#each recent as entry (entry.text)}
          <li>
            <button
              type="button"
              class="flex items-center gap-md rounded-control py-md text-start transition-control inline-full hover:tint-hover active:tint-pressed"
              onclick={() => {
                onRun(entry.text);
              }}
            >
              <RotateCcwClock
                size={ROW_ICON_SIZE}
                aria-hidden="true"
                class="shrink-0 text-muted"
              />
              <span class="flex-1 truncate">{entry.text}</span>
              <span class="text-detail text-muted max-medium:hidden">
                {searchedWhen(entry.atMs, nowMs, locale)}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  <section aria-labelledby={byId} class="flex flex-col gap-xs">
    <h2 id={byId} class="font-semibold">{m.search_by()}</h2>
    <ul class="flex flex-col divide-y divide-border">
      <li class="flex items-center gap-md py-md">
        <BookOpen
          size={ROW_ICON_SIZE}
          aria-hidden="true"
          class="shrink-0 text-muted"
        />
        <span class="flex-1">{m.search_by_title()}</span>
        <span class="text-detail text-muted max-medium:hidden">
          {m.search_by_title_example()}
        </span>
      </li>
    </ul>
  </section>
  <section aria-labelledby={filterId} class="flex flex-col gap-sm">
    <h2 id={filterId} class="font-semibold">{m.search_type_to_filter()}</h2>
    <ul class="flex flex-wrap gap-sm">
      {#each FILTER_CONDITIONS as condition (condition)}
        <li>
          <code
            class="rounded-badge bg-chip px-sm py-2xs font-mono text-detail text-foreground"
          >
            {words[condition]}
          </code>
        </li>
      {/each}
    </ul>
    <p class="text-detail text-muted">
      {m.search_filter_example({ unread: words.unread })}
    </p>
  </section>
</div>
