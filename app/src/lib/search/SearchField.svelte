<script lang="ts">
  import { Search, X } from "@lucide/svelte";
  import { onMount, tick } from "svelte";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";
  import { AndroidPhone } from "#lib/library/android-phone.svelte.ts";
  import type { FilterCondition } from "#lib/library/library-listing.ts";
  import { FLOATING_GLASS } from "#lib/navigation/tab-bar.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { ROW_FOCUS_RING } from "#lib/components/ui/item/looks.ts";

  import { CONDITION_LABELS } from "./condition-labels";
  import ConditionChips from "./ConditionChips.svelte";
  import { isComposing } from "./composition";
  import type { FilterPlace } from "./search-look";

  const SEARCH_ICON_SIZE = 20;
  const CLEAR_ICON_SIZE = 14;

  let {
    text,
    conditions,
    filterPlace,
    onType,
    onRemove,
    onClear,
    onEscape,
    listId,
    activeId,
    hasChoices,
    onKey,
  }: {
    text: string;
    conditions: readonly FilterCondition[];
    filterPlace: FilterPlace;
    onType: (typed: string) => void;
    onRemove: (condition: FilterCondition) => void;
    onClear: () => void;
    onEscape: () => void;
    listId: string;
    activeId: string | undefined;
    hasChoices: boolean;
    onKey: (event: KeyboardEvent) => boolean;
  } = $props();

  const android = new AndroidPhone();
  let input = $state<HTMLInputElement | null>(null);
  const hasTokens = $derived(filterPlace === "token" && conditions.length > 0);
  const canClear = $derived(text !== "" || hasTokens);

  onMount(() => {
    input?.setSelectionRange(text.length, text.length);
  });

  /** Puts back the text the query kept, since taking a filter word out can leave it as it was before the keystroke. */
  async function keepText(change: () => void): Promise<void> {
    change();
    await tick();
    if (input !== null && input.value !== text) {
      input.value = text;
    }
  }

  function typeIn(event: Event & { currentTarget: HTMLInputElement }): void {
    const typed = event.currentTarget.value;
    void keepText(() => {
      onType(typed);
    });
  }

  function clear(): void {
    void keepText(onClear);
    input?.focus();
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

<InputGroup
  class="flex-1 gap-sm rounded-search-field border-2 border-border bg-card px-md block-search-field min-inline-none focus-within:border-accent large:rounded-card large:ps-search-field-inline large:pe-md large:block-search-field-wide ios:max-medium:gap-native-search-field-gap ios:max-medium:block-native-toolbar-button ios:max-medium:focus-within:focus-ring android:gap-md android:rounded-full android:border-0 android:bg-android-container-high android:block-touch-target {FLOATING_GLASS}"
>
  <Search
    size={SEARCH_ICON_SIZE}
    aria-hidden="true"
    class="shrink-0 ios:max-medium:block-native-icon ios:max-medium:inline-native-icon android:text-muted"
  />
  {#if hasTokens}
    <div
      role="group"
      aria-label={m.search_conditions()}
      class="flex snap-x scrollbar-none items-center gap-sm overflow-x-auto min-inline-none"
    >
      {#each conditions as condition (condition)}
        <button
          type="button"
          aria-label={m.search_remove_condition({
            condition: CONDITION_LABELS[condition](),
          })}
          class="flex shrink-0 snap-start items-center rounded-full bg-native-button-primary px-native-search-token-inline text-native-notice-label/native-notice-label font-native-notice-label tracking-native-notice-label text-native-on-button-primary min-block-native-search-token {ROW_FOCUS_RING} focus-visible:outline-native-on-button-primary"
          onclick={() => {
            onRemove(condition);
          }}
        >
          {CONDITION_LABELS[condition]()}
        </button>
      {/each}
    </div>
  {:else if conditions.length > 0 && filterPlace === "field"}
    <ConditionChips
      {conditions}
      {onRemove}
      look={android.isOn ? "material" : "field"}
      class={android.isOn
        ? "scrollbar-none flex-nowrap overflow-x-auto max-inline-2/3 min-inline-none"
        : "shrink-0 flex-nowrap"}
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
    autocorrect="off"
    autocapitalize="none"
    spellcheck="false"
    value={text}
    class={[
      "no-search-cancel text-body large:text-search-wide ios:max-medium:self-stretch ios:max-medium:text-native-search-field/native-search-field ios:max-medium:font-native-search-field ios:max-medium:tracking-native-search-field",
      hasTokens && "shrink-0 basis-1/2",
    ]}
    oninput={typeIn}
    onkeydown={keyDown}
  />
  {#if canClear}
    <Tooltip
      label={m.search_clear()}
      type="button"
      aria-label={m.search_clear()}
      onclick={clear}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class="relative shrink-0 bg-chip text-muted block-search-clear inline-search-clear large:hidden touch:before:absolute touch:before:block-touch-target touch:before:inline-touch-target"
        >
          <X size={CLEAR_ICON_SIZE} strokeWidth={2.5} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  {/if}
  <Kbd aria-hidden="true" class="hidden large:inline">
    {m.search_escape_key()}
  </Kbd>
</InputGroup>
