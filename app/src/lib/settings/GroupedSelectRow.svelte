<script lang="ts" generics="Value extends string">
  import { ChevronsUpDown } from "@lucide/svelte";

  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";

  import {
    LIST_HEADING,
    LIST_PLATE,
    LIST_ROW,
    LIST_TITLE,
    LIST_WORDS,
  } from "./grouped-rows-look.ts";

  const ARROWS_SIZE = 10;

  const ARROWS_CIRCLE =
    "isolate after:absolute after:inset-e-0 after:top-1/2 after:-z-10 after:-translate-y-1/2 after:rounded-full after:bg-native-button-secondary after:block-native-group-select-circle after:inline-native-group-select-circle has-[select:active]:after:bg-native-control-fill-pressed has-[select:open]:after:bg-native-control-fill-pressed [&>svg]:inset-e-native-group-select-inset";

  const FLAT_SELECT = `border-0 bg-transparent ps-0 pe-native-group-select-end shadow-none macos:shadow-none ${LIST_TITLE}`;

  interface Option {
    readonly value: Value;
    readonly label: string;
  }

  let {
    heading,
    label,
    options,
    value,
    onChoose,
  }: {
    heading: string;
    label: string;
    options: readonly Option[];
    value: Value;
    onChoose: (value: Value) => void;
  } = $props();

  const id = $props.id();

  function choose(picked: string): void {
    const option = options.find((option) => option.value === picked);
    if (option !== undefined) {
      onChoose(option.value);
    }
  }
</script>

<section aria-labelledby="{id}-heading" class="flex flex-col gap-xs">
  <h2 id="{id}-heading" class={LIST_HEADING}>{heading}</h2>
  <div class={[LIST_ROW, LIST_PLATE]}>
    <span id="{id}-label" class={["flex-1", LIST_TITLE, LIST_WORDS]}
      >{label}</span
    >
    <NativeSelect
      aria-labelledby="{id}-label"
      {value}
      icon={ChevronsUpDown}
      iconSize={ARROWS_SIZE}
      class={ARROWS_CIRCLE}
      fieldClass={FLAT_SELECT}
      onchange={({
        currentTarget,
      }: Event & { currentTarget: HTMLSelectElement }) => {
        choose(currentTarget.value);
      }}
    >
      {#each options as option (option.value)}
        <option value={option.value}>{option.label}</option>
      {/each}
    </NativeSelect>
  </div>
</section>
