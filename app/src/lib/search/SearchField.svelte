<script lang="ts">
  import { Search, X } from "@lucide/svelte";
  import { onMount, tick } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";
  import type { FilterCondition } from "#lib/library/library-listing.ts";
  import { m } from "#lib/paraglide/messages.js";

  import ConditionChips from "./ConditionChips.svelte";
  import { isComposing } from "./composition";

  const SEARCH_ICON_SIZE = 20;
  const CLEAR_ICON_SIZE = 14;

  let {
    text,
    conditions,
    onType,
    onRemove,
    onEscape,
    listId,
    activeId,
    hasChoices,
    onKey,
  }: {
    text: string;
    conditions: readonly FilterCondition[];
    onType: (typed: string) => void;
    onRemove: (condition: FilterCondition) => void;
    onEscape: () => void;
    listId: string;
    activeId: string | undefined;
    hasChoices: boolean;
    onKey: (event: KeyboardEvent) => boolean;
  } = $props();

  let input = $state<HTMLInputElement | null>(null);

  onMount(() => {
    input?.setSelectionRange(text.length, text.length);
  });

  /** Puts back the text the query kept, since taking a filter word out can leave it as it was before the keystroke. */
  async function type(typed: string): Promise<void> {
    onType(typed);
    await tick();
    if (input !== null && input.value !== text) {
      input.value = text;
    }
  }

  function typeIn(event: Event & { currentTarget: HTMLInputElement }): void {
    void type(event.currentTarget.value);
  }

  function keyDown(event: KeyboardEvent): void {
    if (isComposing(event)) {
      return;
    }
    if (onKey(event)) {
      event.preventDefault();
      return;
    }
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
  <Input
    bind:ref={input}
    type="search"
    role="combobox"
    aria-controls={listId}
    aria-expanded={hasChoices}
    aria-autocomplete="list"
    aria-activedescendant={activeId}
    data-arrival-focus
    aria-label={m.search_field()}
    placeholder={m.search_field()}
    maxlength={SEARCH_MAX_CHARS}
    value={text}
    class="no-search-cancel text-body large:text-search-wide"
    oninput={typeIn}
    onkeydown={keyDown}
  />
  {#if text !== ""}
    <Tooltip
      label={m.search_clear()}
      type="button"
      aria-label={m.search_clear()}
      onclick={() => {
        void type("");
        input?.focus();
      }}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class="shrink-0 bg-chip text-muted block-search-clear inline-search-clear large:hidden"
        >
          <X size={CLEAR_ICON_SIZE} strokeWidth={2.5} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  {/if}
  <Kbd aria-hidden="true" class="hidden large:inline">
    {m.search_escape_key()}
  </Kbd>
</div>
