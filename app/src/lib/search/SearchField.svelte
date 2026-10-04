<script lang="ts">
  import { Search, X } from "@lucide/svelte";
  import { onMount, tick } from "svelte";

  import type { FilterCondition } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ConditionChips from "./ConditionChips.svelte";

  const SEARCH_ICON_SIZE = 20;
  const CLEAR_ICON_SIZE = 14;
  const MAX_CHARS = 200;

  let {
    text,
    conditions,
    onType,
    onRemove,
    onEscape,
  }: {
    text: string;
    conditions: readonly FilterCondition[];
    onType: (typed: string) => void;
    onRemove: (condition: FilterCondition) => void;
    onEscape: () => void;
  } = $props();

  let input: HTMLInputElement | undefined = $state();

  onMount(() => {
    input?.setSelectionRange(text.length, text.length);
  });

  /** Puts back the text the query kept, since taking a filter word out can leave it as it was before the keystroke. */
  async function type(typed: string): Promise<void> {
    onType(typed);
    await tick();
    if (input !== undefined && input.value !== text) {
      input.value = text;
    }
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }
    const last = conditions.at(-1);
    if (event.key === "Backspace" && text === "" && last !== undefined) {
      event.preventDefault();
      onRemove(last);
    }
  }
</script>

<div
  class="flex flex-1 items-center gap-sm rounded-search-field border-2 border-border bg-card px-md block-search-field min-inline-none focus-within:border-accent large:rounded-card large:ps-search-field-inline large:pe-md large:block-search-field-wide"
>
  <Search size={SEARCH_ICON_SIZE} aria-hidden="true" class="shrink-0" />
  {#if conditions.length > 0}
    <ConditionChips
      {conditions}
      {onRemove}
      look="field"
      class="hidden shrink-0 flex-nowrap medium:flex"
    />
  {/if}
  <input
    bind:this={input}
    type="search"
    data-arrival-focus
    aria-label={m.search_field()}
    placeholder={m.search_field()}
    maxlength={MAX_CHARS}
    value={text}
    class="no-search-cancel flex-1 bg-transparent text-body outline-none min-inline-none placeholder:text-muted large:text-search-wide"
    oninput={(event) => {
      void type(event.currentTarget.value);
    }}
    onkeydown={keyDown}
  />
  {#if text !== ""}
    <button
      type="button"
      aria-label={m.search_clear()}
      class="flex shrink-0 items-center justify-center rounded-full bg-chip text-muted block-search-clear inline-search-clear large:hidden"
      onclick={() => {
        void type("");
        input?.focus();
      }}
    >
      <X size={CLEAR_ICON_SIZE} strokeWidth={2.5} aria-hidden="true" />
    </button>
  {/if}
  <kbd
    aria-hidden="true"
    class="hidden shrink-0 rounded-badge border border-border bg-chip px-key-inline py-key-block font-ui text-caption font-bold large:inline"
  >
    {m.search_escape_key()}
  </kbd>
</div>
