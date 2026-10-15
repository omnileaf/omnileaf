<script lang="ts">
  import { Compass, ZoomOut } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import type { SpellingSuggestion } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { nothingFoundTitle } from "./nothing-found";

  const ART_ICON_SIZE = 28;
  const SOURCES_ICON_SIZE = 16;
  const SUGGESTION_SPOT = "\u0000";

  let {
    text,
    suggestion,
    onSuggest,
  }: {
    text: string;
    suggestion: SpellingSuggestion | null;
    onSuggest: (text: string) => void;
  } = $props();

  const titleId = $props.id();
  const [beforeSuggestion, afterSuggestion] = $derived(
    m
      .search_did_you_mean({ suggestion: SUGGESTION_SPOT })
      .split(SUGGESTION_SPOT),
  );
</script>

<Empty
  aria-labelledby={titleId}
  class="flex-1 justify-center px-2xl pbe-nothing-found-lift"
>
  <EmptyMedia>
    <ZoomOut size={ART_ICON_SIZE} aria-hidden="true" />
  </EmptyMedia>
  <EmptyTitle id={titleId} class="large:text-heading">
    {nothingFoundTitle(text)}
  </EmptyTitle>
  {#if text !== ""}
    <EmptyDescription class="text-lead max-inline-nothing-found">
      {#if suggestion === null}
        {m.search_nothing_hint()}
      {:else}
        {beforeSuggestion}<button
          type="button"
          class="rounded-control font-medium text-foreground underline underline-offset-2 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          onclick={() => {
            onSuggest(suggestion.text);
          }}>{suggestion.text}</button
        >{afterSuggestion}
        {#if suggestion.chapterOf !== null}
          {m.search_chapter_title_in({ series: suggestion.chapterOf })}
        {/if}
      {/if}
    </EmptyDescription>
    <div class="mbs-lg flex flex-col items-center gap-sm">
      <Button
        type="button"
        look="outline"
        disabled
        class="flex items-center gap-xs rounded-full px-lg font-medium text-muted min-block-pointer-button disabled:opacity-60 touch:min-block-touch-target"
      >
        <Compass size={SOURCES_ICON_SIZE} aria-hidden="true" />
        {m.search_your_sources()}
      </Button>
      <p class="text-detail text-muted">{m.search_sources_coming()}</p>
    </div>
  {/if}
</Empty>
