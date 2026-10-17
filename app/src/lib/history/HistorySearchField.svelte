<script lang="ts">
  import { Search, X } from "@lucide/svelte";
  import type { ClassValue } from "svelte/elements";

  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";
  import { InputGroup } from "#lib/components/ui/input-group/index.ts";
  import { Kbd } from "#lib/components/ui/kbd/index.ts";
  import { Tooltip } from "#lib/components/ui/tooltip/index.ts";
  import { type Platform, SEARCH_MAX_CHARS } from "#lib/ipc/bindings.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { searchShortcutLabel } from "#lib/search/quick-open-shortcut.ts";

  const ICON_SIZE = 16;
  const CLEAR_ICON_SIZE = 14;

  let {
    field = $bindable(null),
    text,
    platform,
    look,
    class: className,
    onFind,
  }: {
    field?: HTMLInputElement | null;
    text: string;
    platform: Platform;
    look: "bar" | "field";
    class?: ClassValue;
    onFind: (text: string) => void;
  } = $props();
</script>

<InputGroup
  class={[
    "gap-sm px-md text-muted",
    look === "bar"
      ? "rounded-search-field bg-well block-touch-target"
      : "rounded-control border border-field bg-card block-pointer-button focus-within:border-accent",
    className,
  ]}
>
  <Search size={ICON_SIZE} aria-hidden="true" class="shrink-0" />
  <Input
    bind:ref={field}
    type="search"
    value={text}
    aria-label={m.history_search()}
    placeholder={m.history_search()}
    maxlength={SEARCH_MAX_CHARS}
    class={[
      "no-search-cancel text-foreground",
      look === "bar" ? "text-body" : "text-small",
    ]}
    oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
      onFind(event.currentTarget.value);
    }}
  />
  {#if look === "bar" && text !== ""}
    <Tooltip
      label={m.search_clear()}
      type="button"
      aria-label={m.search_clear()}
      onclick={() => {
        onFind("");
        field?.focus();
      }}
    >
      {#snippet child({ props })}
        <Button
          {...props}
          look="icon"
          class="shrink-0 bg-chip text-muted block-search-clear inline-search-clear"
        >
          <X size={CLEAR_ICON_SIZE} strokeWidth={2.5} aria-hidden="true" />
        </Button>
      {/snippet}
    </Tooltip>
  {/if}
  {#if look === "field"}
    <Kbd aria-hidden="true">{searchShortcutLabel(platform)}</Kbd>
  {/if}
</InputGroup>
