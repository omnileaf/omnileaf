<script lang="ts">
  import { Compass, Search, ZoomOut } from "@lucide/svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import {
    Empty,
    EmptyDescription,
    EmptyMedia,
    EmptyTitle,
  } from "#lib/components/ui/empty/index.ts";
  import type { SpellingSuggestion } from "#lib/ipc/bindings.ts";
  import { WindowWidth } from "#lib/page/breakpoints.ts";
  import { currentPlatform, phoneOf } from "#lib/page/platform.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { nothingFoundTitle } from "./nothing-found";

  const ART_ICON_SIZE = 28;
  const NATIVE_ART_ICON_SIZE = 41;
  const NATIVE_TYPE = "text-native-empty/native-empty tracking-native-empty";
  const NATIVE_TITLE = `${NATIVE_TYPE} font-native-empty-title text-foreground`;
  const NATIVE_HINT = `${NATIVE_TYPE} font-native-empty-body`;
  const NATIVE_SUGGESTION = "text-accent underline underline-offset-2";
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
  const platform = currentPlatform();
  const width = new WindowWidth();
  const isNative = $derived(phoneOf(platform, width.current) === "ios");
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
  <EmptyMedia
    class={isNative ? "bg-transparent text-accent block-auto inline-auto" : ""}
  >
    {#if isNative}
      <Search size={NATIVE_ART_ICON_SIZE} aria-hidden="true" />
    {:else}
      <ZoomOut size={ART_ICON_SIZE} aria-hidden="true" />
    {/if}
  </EmptyMedia>
  <EmptyTitle
    id={titleId}
    class={isNative ? NATIVE_TITLE : "large:text-heading"}
  >
    {nothingFoundTitle(text)}
  </EmptyTitle>
  {#if text !== ""}
    <EmptyDescription
      class={["max-inline-nothing-found", isNative ? NATIVE_HINT : "text-lead"]}
    >
      {#if suggestion === null}
        {m.search_nothing_hint()}
      {:else}
        {beforeSuggestion}<button
          type="button"
          class={[
            "rounded-control focus-visible:outline-2 focus-visible:outline-accent",
            isNative
              ? NATIVE_SUGGESTION
              : "font-medium text-foreground underline underline-offset-2 hover:text-accent",
          ]}
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
