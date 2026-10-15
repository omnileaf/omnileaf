<script lang="ts">
  import { Check } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Toggle } from "#lib/components/ui/toggle/index.ts";
  import { m } from "#lib/paraglide/messages.js";

  import { SEARCH_SCOPES, type SearchScope } from "./search-query.svelte";

  const CHECK_SIZE = 16;

  const LABELS = {
    everything: m.search_everything,
    manga: m.search_scope_manga,
    book: m.search_scope_books,
  } satisfies Record<SearchScope, () => string>;

  let {
    scope,
    onNarrow,
    class: className,
  }: {
    scope: SearchScope;
    onNarrow: (scope: SearchScope) => void;
    class?: ClassValue;
  } = $props();
</script>

<div
  role="group"
  aria-label={m.search_scope()}
  class={["flex shrink-0 gap-icon-gap overflow-x-auto", className]}
>
  {#each SEARCH_SCOPES as choice (choice)}
    {@const isChosen = scope === choice}
    <Toggle
      bind:pressed={
        () => isChosen,
        () => {
          onNarrow(choice);
        }
      }
    >
      <span class="flex items-center gap-xs">
        {#if isChosen}
          <Check size={CHECK_SIZE} aria-hidden="true" />
        {/if}
        {LABELS[choice]()}
      </span>
    </Toggle>
  {/each}
</div>
