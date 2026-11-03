<script lang="ts" generics="Value extends string">
  import { ChevronRight } from "@lucide/svelte";

  import ChoiceDialog, { type Choice } from "./ChoiceDialog.svelte";
  import { GROUP_PLATE } from "#lib/page/plates.ts";

  const CHEVRON_SIZE = 18;

  let {
    title,
    value,
    choices,
    chosen,
    onChoose,
  }: {
    title: string;
    value: string;
    choices: readonly Choice<Value>[];
    chosen: Value;
    onChoose: (value: Value) => void;
  } = $props();

  let isOpen = $state(false);
</script>

<div class={["flex flex-col overflow-hidden", GROUP_PLATE]}>
  <button
    type="button"
    aria-haspopup="dialog"
    class="flex items-center gap-md py-xs ps-lg pe-md text-start text-native-row-title/native-row-title transition-control inline-full min-block-native-row active:bg-native-row-pressed"
    onclick={() => {
      isOpen = true;
    }}
  >
    <span class="flex-auto wrap-anywhere min-inline-none">{title}</span>
    <span class="shrink text-end wrap-anywhere text-muted min-inline-none"
      >{value}</span
    >
    <ChevronRight
      size={CHEVRON_SIZE}
      aria-hidden="true"
      class="shrink-0 text-muted rtl:-scale-x-100"
    />
  </button>
</div>
<ChoiceDialog
  {isOpen}
  {title}
  {choices}
  {chosen}
  {onChoose}
  onClose={() => {
    isOpen = false;
  }}
/>
