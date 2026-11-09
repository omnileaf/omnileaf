<script lang="ts">
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import type { ChapterHit } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";

  import { ANDROID_SEARCH_LOOK, searchLook } from "./search-look";

  const PREVIEW = 5;

  let {
    hits,
    isComplete,
    onShowAll,
  }: {
    hits: readonly ChapterHit[];
    isComplete: boolean;
    onShowAll: () => void;
  } = $props();

  const android = new AndroidPhone();
  const look = $derived(
    android.isOn ? ANDROID_SEARCH_LOOK : searchLook("macos", undefined),
  );
  const headingId = $props.id();
  const numbers = new Intl.NumberFormat(getLocale());
  let isExpanded = $state(false);
  const shown = $derived(isExpanded ? hits : hits.slice(0, PREVIEW));
  const hasMore = $derived(
    !isExpanded && (hits.length > PREVIEW || !isComplete),
  );
</script>

<section aria-labelledby={headingId} class={look.section}>
  <div class="flex items-baseline justify-between">
    <h2 id={headingId} class={look.heading}>
      {m.search_chapters_heading({ count: numbers.format(hits.length) })}
    </h2>
    {#if hasMore}
      <Button
        type="button"
        variant="link"
        size="small"
        onclick={() => {
          isExpanded = true;
          onShowAll();
        }}
      >
        {m.search_show_all()}
      </Button>
    {/if}
  </div>
  <ul class="flex flex-col">
    {#each shown as hit (hit.book)}
      <li>
        <a
          href={resolve("/read/[book]", { book: hit.book })}
          class={[
            "flex flex-col rounded-control hover:bg-hover focus-visible:focus-ring",
            android.isOn ? "px-lg py-sm" : "px-sm py-xs",
          ]}
        >
          <span class={look.title}>{hit.title}</span>
          <span class={look.line}>{hit.seriesTitle}</span>
        </a>
      </li>
    {/each}
  </ul>
</section>
