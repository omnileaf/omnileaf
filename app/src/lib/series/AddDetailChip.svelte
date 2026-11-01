<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { cn } from "#lib/components/cn.ts";
  import { Button } from "#lib/components/ui/button/index.ts";
  import { Input } from "#lib/components/ui/input/index.ts";

  import {
    ANDROID_DETAIL_CHIP,
    DETAIL_CHIP,
    GROUPED_DETAIL_CHIP,
  } from "./detail-chip.ts";
  import { MACOS_TYPING_FIELD } from "./detail-field.ts";

  const ICON_SIZE = 16;
  const MACOS_ICON_SIZE = 12;
  const TYPING_CHIP =
    "flex-none rounded-shadcn-control border border-accent bg-transparent px-md text-label min-block-detail-chip touch:text-body";

  let {
    label,
    isGrouped = false,
    isAndroid = false,
    isMacos = false,
    onAdd,
  }: {
    label: string;
    isGrouped?: boolean;
    isAndroid?: boolean;
    isMacos?: boolean;
    onAdd: (name: string) => void;
  } = $props();

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

{#if isTyping}
  <Input
    value={typed}
    oninput={(event: Event & { currentTarget: HTMLInputElement }) => {
      typed = event.currentTarget.value;
    }}
    aria-label={label}
    placeholder={label}
    class={isMacos ? MACOS_TYPING_FIELD : TYPING_CHIP}
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
