<script lang="ts">
  import { BookOpen, RotateCcwClock } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { IconName } from "#lib/icons/names.ts";
  import { FILTER_CONDITIONS } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";

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

  interface Searchable {
    readonly icon: IconName;
    readonly label: () => string;
    readonly note: (() => string) | undefined;
  }

  const ANDROID_SEARCHABLES: readonly Searchable[] = [
    { icon: "book-open", label: m.search_by_title, note: undefined },
    { icon: "user", label: m.search_by_creator, note: undefined },
    { icon: "tag", label: m.search_by_tag, note: undefined },
    { icon: "list", label: m.search_by_chapter, note: undefined },
    {
      icon: "file-text",
      label: m.search_by_words,
      note: m.search_by_words_soon,
    },
  ];

  const id = $props.id();
  const recentId = `${id}-recent`;
  const byId = `${id}-by`;
  const filterId = `${id}-filter`;
  const words = filterWords();
  const android = new AndroidPhone();
  const look = $derived(startLook(isGrouped, android.isOn));
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
                {#if android.isOn}
                  <Icon name="history" size={look.iconSize} />
                {:else}
                  <RotateCcwClock size={look.iconSize} aria-hidden="true" />
                {/if}
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
      {#if android.isOn}
        {#each ANDROID_SEARCHABLES as searchable (searchable.icon)}
          <li class={look.staticRow}>
            <span data-slot="item-media" class={look.lead}>
              <Icon name={searchable.icon} size={look.iconSize} />
            </span>
            <span data-slot="item-title" class="flex-1">
              {searchable.label()}
            </span>
            {#if searchable.note !== undefined}
              <span class="text-detail text-muted">{searchable.note()}</span>
            {/if}
          </li>
        {/each}
      {:else}
        <li class={look.staticRow}>
          <span data-slot="item-media" class={look.lead}>
            <BookOpen size={look.iconSize} aria-hidden="true" />
          </span>
          <span data-slot="item-title" class="flex-1"
            >{m.search_by_title()}</span
          >
          <span class="text-detail text-muted max-medium:hidden">
            {m.search_by_title_example()}
          </span>
        </li>
      {/if}
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
