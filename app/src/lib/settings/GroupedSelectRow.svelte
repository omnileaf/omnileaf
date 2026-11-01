<script lang="ts" generics="Value extends string">
  import { ChevronsUpDown } from "@lucide/svelte";

  import { NativeSelect } from "#lib/components/ui/native-select/index.ts";

  import {
    LIST_HEADING,
    LIST_PLATE,
    LIST_ROW,
    LIST_TITLE,
  } from "./grouped-rows-look";

  const ARROWS_SIZE = 10;

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
    const option = options.find(({ value }) => value === picked);
    if (option !== undefined) {
      onChoose(option.value);
    }
  }
</script>

<section aria-labelledby="{id}-heading" class="flex flex-col gap-xs">
  <h2 id="{id}-heading" class={LIST_HEADING}>{heading}</h2>
  <div class={[LIST_ROW, LIST_PLATE]}>
    <span id="{id}-label" class={["flex-1", LIST_TITLE]}>{label}</span>
    <NativeSelect
      aria-labelledby="{id}-label"
      {value}
      icon={ChevronsUpDown}
      iconSize={ARROWS_SIZE}
      fieldClass={LIST_TITLE}
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
