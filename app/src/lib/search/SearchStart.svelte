<script lang="ts">
  import { BookOpen, RotateCcwClock } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { FILTER_CONDITIONS } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { filterWords } from "./condition-labels";
  import { startLook } from "./search-look";
  import { type RecentSearch, searchedWhen } from "./recent-searches.svelte";

  const TODAYS_WORD =
    "rounded-badge bg-chip px-sm py-2xs font-mono text-detail text-foreground";
  const NATIVE_WORD =
    "flex items-center rounded-full bg-native-button-outline font-ui px-md text-foreground text-native-button/native-button font-native-button tracking-native-button min-block-native-segment";

  let {
    recent,
    nowMs,
    isGrouped,
    onRun,
    onClear,
  }: {
    recent: readonly RecentSearch[];
    nowMs: number;
    isGrouped: boolean;
    onRun: (text: string) => void;
    onClear: () => void;
  } = $props();

  const id = $props.id();
  const recentId = `${id}-recent`;
  const byId = `${id}-by`;
  const filterId = `${id}-filter`;
  const words = filterWords();
  const look = $derived(startLook(isGrouped));
  const locale = getLocale();
</script>

<div class={look.body}>
  {#if recent.length > 0}
    <section aria-labelledby={recentId} class={look.section}>
      <div class={look.head}>
        <h2 id={recentId} class={look.headingBesideAction}>
          {m.search_recent()}
        </h2>
        <Button {...look.clear} onclick={onClear}>
          {m.search_recent_clear()}
        </Button>
      </div>
      <ul class={look.rows}>
        {#each recent as entry (entry.text)}
          <li>
            <button
              type="button"
              class={look.row}
              onclick={() => {
                onRun(entry.text);
              }}
            >
              <span data-slot="item-media" class={look.lead}>
                <RotateCcwClock size={look.iconSize} aria-hidden="true" />
              </span>
              <span data-slot="item-title" class="flex-1 truncate"
                >{entry.text}</span
              >
              <span class="text-detail text-muted max-medium:hidden">
                {searchedWhen(entry.atMs, nowMs, locale)}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  <section aria-labelledby={byId} class={look.section}>
    <h2 id={byId} class={look.heading}>{m.search_by()}</h2>
    <ul class={look.rows}>
      <li class={look.staticRow}>
        <span data-slot="item-media" class={look.lead}>
          <BookOpen size={look.iconSize} aria-hidden="true" />
        </span>
        <span data-slot="item-title" class="flex-1">{m.search_by_title()}</span>
        <span class="text-detail text-muted max-medium:hidden">
          {m.search_by_title_example()}
        </span>
      </li>
    </ul>
  </section>
  <section aria-labelledby={filterId} class={look.filterSection}>
    <h2 id={filterId} class={look.heading}>{m.search_type_to_filter()}</h2>
    {#if isGrouped}
      <p class={look.example}>
        {m.search_filter_example({ unread: words.unread })}
      </p>
    {/if}
    <ul class={look.filters}>
      {#each FILTER_CONDITIONS as condition (condition)}
        <li>
          <code class={isGrouped ? NATIVE_WORD : TODAYS_WORD}>
            {words[condition]}
          </code>
        </li>
      {/each}
    </ul>
    {#if !isGrouped}
      <p class={look.example}>
        {m.search_filter_example({ unread: words.unread })}
      </p>
    {/if}
  </section>
</div>
