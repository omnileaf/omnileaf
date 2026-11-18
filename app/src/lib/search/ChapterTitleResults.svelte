<script lang="ts">
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Icon } from "#lib/components/ui/icon/index.ts";
  import type { ChapterHit } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import NotConnectedTag from "#lib/library/NotConnectedTag.svelte";
  import RowActionButton from "#lib/library/RowActionButton.svelte";

  import { ANDROID_SEARCH_LOOK, searchLook } from "./search-look";

  const PREVIEW = 5;

  let {
    hits,
    isComplete,
    onShowAll,
    onNotConnected,
    onFind,
  }: {
    hits: readonly ChapterHit[];
    isComplete: boolean;
    onShowAll: () => void;
    onNotConnected: (hit: ChapterHit) => void;
    onFind: (hit: ChapterHit) => void;
  } = $props();

  const android = new AndroidPhone();
  const look = $derived(
    android.isOn ? ANDROID_SEARCH_LOOK : searchLook("macos", undefined),
  );
  const rowLook = $derived([
    "flex flex-1 flex-col rounded-control min-inline-none hover:bg-hover focus-visible:focus-ring",
    android.isOn ? "px-lg py-sm" : "px-sm py-xs",
  ]);
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
      {@const away =
        hit.file.kind === "notConnected" ? look.notConnected : undefined}
      <li class="flex items-center">
        {#if away === undefined}
          <a href={resolve("/read/[book]", { book: hit.book })} class={rowLook}>
            <span class={look.title}>{hit.title}</span>
            <span class={look.line}>{hit.seriesTitle}</span>
          </a>
        {:else}
          <button
            type="button"
            class={[rowLook, "text-start"]}
            onclick={() => {
              onNotConnected(hit);
            }}
          >
            <span class={[look.title, away.title]}>{hit.title}</span>
            <span class={[look.line, away.line]}>
              {hit.seriesTitle}
              <NotConnectedTag class={away.tag} />
            </span>
          </button>
          <RowActionButton
            label={m.search_find_folder_for({ title: hit.seriesTitle })}
            tooltip={m.missing_find_folder()}
            onclick={() => {
              onFind(hit);
            }}
          >
            <Icon name="folder-search" />
          </RowActionButton>
        {/if}
      </li>
    {/each}
  </ul>
</section>
