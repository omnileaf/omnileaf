<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import { Input } from "#lib/components/ui/input/index.ts";

  import { DETAIL_CHIP } from "./detail-chip.ts";

  const ICON_SIZE = 16;

  let { label, onAdd }: { label: string; onAdd: (name: string) => void } =
    $props();

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
    class="flex-none rounded-shadcn-control border border-accent bg-transparent px-md text-label min-block-detail-chip touch:text-body"
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
{:else}
  <button
    type="button"
    class={[DETAIL_CHIP, "pe-md"]}
    onclick={() => {
      isTyping = true;
    }}
  >
    <Plus size={ICON_SIZE} aria-hidden="true" />
    {label}
  </button>
{/if}
