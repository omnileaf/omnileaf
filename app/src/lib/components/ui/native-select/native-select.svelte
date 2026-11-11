<script lang="ts" generics="Value extends string">
  import { ChevronDown } from "@lucide/svelte";
  import type { HTMLSelectAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import {
    choiceOf,
    type SelectChoice,
  } from "#lib/components/ui/select-menu/index.ts";

  const ICON_SIZE = 16;

  let {
    class: className,
    fieldClass,
    icon: Icon = ChevronDown,
    iconSize = ICON_SIZE,
    choices,
    value,
    onChoose,
    ...restProps
  }: Omit<
    HTMLSelectAttributes,
    "children" | "value" | "onchange" | "multiple"
  > & {
    fieldClass?: string;
    icon?: typeof ChevronDown;
    iconSize?: number;
    choices: readonly SelectChoice<Value>[];
    value: Value;
    onChoose: (value: Value) => void;
  } = $props();

  function choose(picked: string): void {
    const choice = choiceOf(choices, picked);
    if (choice !== undefined) {
      onChoose(choice.value);
    }
  }
</script>

<div class={cn("relative flex items-center", className)}>
  <select
    class={cn(
      "flex-1 appearance-none rounded-select border border-select-edge bg-select ps-md pe-select-end text-label text-ellipsis block-panel-field min-inline-none macos:shadow-raised windows:border-be-windows-stroke-strong linux:shadow-raised",
      fieldClass,
    )}
    {value}
    onchange={({ currentTarget }) => {
      choose(currentTarget.value);
    }}
    {...restProps}
  >
    {#each choices as choice (choice.value)}
      <option value={choice.value}>{choice.label}</option>
    {/each}
  </select>
  <Icon
    size={iconSize}
    aria-hidden="true"
    class="pointer-events-none absolute inset-e-pill-inline text-muted"
  />
</div>
