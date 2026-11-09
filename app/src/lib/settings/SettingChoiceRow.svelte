<script lang="ts" generics="Value extends string">
  import type { HTMLAttributes } from "svelte/elements";

  import { FLUSH_BLEED } from "./android-flush-look.ts";
  import ChoiceDialog, { type Choice } from "./ChoiceDialog.svelte";

  let {
    title,
    value,
    valueLang,
    help,
    choices,
    chosen,
    dialogTitle = title,
    bleed = FLUSH_BLEED,
    onChoose,
    ...rest
  }: {
    title: string;
    value: string;
    valueLang?: string | undefined;
    help?: string | undefined;
    choices: readonly Choice<Value>[];
    chosen: Value;
    dialogTitle?: string;
    bleed?: string;
    onChoose: (value: Value) => void;
  } & DataAttributes = $props();

  type DataAttributes = Pick<
    HTMLAttributes<HTMLButtonElement>,
    `data-${string}`
  >;

  let isOpen = $state(false);
</script>

<button
  {...rest}
  type="button"
  aria-haspopup="dialog"
  class="{bleed} flex items-center gap-lg py-sm ps-lg pe-xl text-start transition-control min-block-native-row-two hover:tint-hover active:tint-pressed"
  onclick={() => {
    isOpen = true;
  }}
>
  <span class="flex flex-1 flex-col min-inline-none">
    <span class="text-body tracking-native-row-title">{title}</span>
    <span
      lang={valueLang}
      class="text-native-row-subtitle/native-row-subtitle text-muted"
      >{value}</span
    >
    {#if help !== undefined}
      <span class="text-native-row-subtitle/native-row-subtitle text-muted"
        >{help}</span
      >
    {/if}
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
