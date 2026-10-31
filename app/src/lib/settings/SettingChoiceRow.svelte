<script lang="ts" generics="Value extends string">
  import ChoiceDialog, { type Choice } from "./ChoiceDialog.svelte";

  let {
    title,
    value,
    valueLang,
    choices,
    chosen,
    dialogTitle = title,
    onChoose,
  }: {
    title: string;
    value: string;
    valueLang?: string | undefined;
    choices: readonly Choice<Value>[];
    chosen: Value;
    dialogTitle?: string;
    onChoose: (value: Value) => void;
  } = $props();

  let isOpen = $state(false);
</script>

<button
  type="button"
  aria-haspopup="dialog"
  class="-mx-page-start -me-page-end flex items-center gap-lg py-sm ps-lg pe-xl text-start transition-control min-block-native-row-two hover:tint-hover active:tint-pressed"
  onclick={() => {
    isOpen = true;
  }}
>
  <span class="flex flex-1 flex-col min-inline-none">
    <span class="text-body">{title}</span>
    <span
      lang={valueLang}
      class="text-native-row-subtitle/native-row-subtitle text-muted"
      >{value}</span
    >
  </span>
</button>
<ChoiceDialog
  {isOpen}
  title={dialogTitle}
  {choices}
  {chosen}
  {onChoose}
  onClose={() => {
    isOpen = false;
  }}
/>
