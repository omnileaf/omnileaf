<script lang="ts">
  import { Plus } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";

  import {
    ANDROID_DETAIL_CHIP,
    DETAIL_CHIP,
    GROUPED_DETAIL_CHIP,
  } from "./detail-chip.ts";
  import { MACOS_TYPING_FIELD } from "./detail-field.ts";
  import {
    SHEET_ADD_ROW,
    SHEET_ADD_ROW_FIELD,
    SHEET_ADD_ROW_ICON_SIZE,
    SHEET_ADD_ROW_LEAD,
    SHEET_ADD_ROW_TYPING,
  } from "./sheet-field-look.ts";

  const ICON_SIZE = 16;
  const MACOS_ICON_SIZE = 12;
  const TYPING_CHIP =
    "flex-none rounded-shadcn-control border border-accent bg-transparent px-md text-label min-block-detail-chip touch:text-body";

  let {
    label,
    isGrouped = false,
    isAndroid = false,
    isMacos = false,
    isSheet = false,
    onAdd,
  }: {
    label: string;
    isGrouped?: boolean;
    isAndroid?: boolean;
    isMacos?: boolean;
    isSheet?: boolean;
    onAdd: (name: string) => void;
  } = $props();

  const typing: Snippet<[string]> = typingInput;
  const plusColumn: Snippet = plusColumnIcon;
  let isTyping = $state(false);
  let typed = $state("");

  function add(): void {
    const name = typed.trim();
    if (name !== "") {
      onAdd(name);
    }
    isTyping = false;
    typed = "";
  }

  function focusOnShow(field: HTMLInputElement): void {
    field.focus();
  }
</script>

{#snippet typingInput(className: string)}
  <Input
    value={typed}
    oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
      typed = event.currentTarget.value;
    }}
    aria-label={label}
    placeholder={label}
    class={className}
    {@attach focusOnShow}
    onkeydown={(event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        add();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        isTyping = false;
        typed = "";
      }
    }}
    onblur={add}
  />
{/snippet}

{#snippet plusColumnIcon()}
  <span class={SHEET_ADD_ROW_LEAD}>
    <Plus size={SHEET_ADD_ROW_ICON_SIZE} aria-hidden="true" />
  </span>
{/snippet}

{#if isSheet && isTyping}
  <div class={SHEET_ADD_ROW_TYPING}>
    {@render plusColumn()}
    {@render typing(SHEET_ADD_ROW_FIELD)}
  </div>
{:else if isSheet}
  <button
    type="button"
    class={SHEET_ADD_ROW}
    onclick={() => {
      isTyping = true;
    }}
  >
    {@render plusColumn()}
    {label}
  </button>
{:else if isTyping}
  {@render typing(isMacos ? MACOS_TYPING_FIELD : TYPING_CHIP)}
{:else if isMacos}
  <Button
    type="button"
    variant="secondary"
    size="small"
    onclick={() => {
      isTyping = true;
    }}
  >
    <Plus size={MACOS_ICON_SIZE} aria-hidden="true" />
    {label}
  </Button>
{:else}
  <button
    type="button"
    class={cn(
      DETAIL_CHIP,
      "pe-md",
      isGrouped && GROUPED_DETAIL_CHIP,
      isAndroid && ANDROID_DETAIL_CHIP,
    )}
    onclick={() => {
      isTyping = true;
    }}
  >
    <Plus size={ICON_SIZE} aria-hidden="true" />
    {label}
  </button>
{/if}
