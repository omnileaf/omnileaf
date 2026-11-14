<script lang="ts" generics="Value extends string">
  import { ChevronDown } from "@lucide/svelte";
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ClassValue, HTMLButtonAttributes } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import {
    choiceOf,
    type SelectChoice,
    SelectMenu,
  } from "#lib/components/ui/select-menu/index.ts";

  import { OUTLINED_FIELD_LABEL } from "./looks.ts";

  const CHEVRON_SIZE = 24;

  let {
    label,
    labelClass = "bg-background",
    class: className,
    choices,
    value,
    onChoose,
    ...triggerProps
  }: Omit<
    HTMLButtonAttributes,
    "id" | "class" | "children" | "value" | "type"
  > & {
    label: string;
    labelClass?: ClassValue;
    class?: ClassValue;
    choices: readonly SelectChoice<Value>[];
    value: Value;
    onChoose: (value: Value) => void;
  } = $props();

  const id = $props.id();
  const labelId = `${id}-label`;
  const chosenLabel = $derived(choiceOf(choices, value)?.label ?? "");

  function choose(picked: string): void {
    const choice = choiceOf(choices, picked);
    if (choice !== undefined) {
      onChoose(choice.value);
    }
  }
</script>

<div
  data-slot="outlined-select"
  class={cn("relative min-inline-none", className)}
>
  <label
    id={labelId}
    for={id}
    class={cn(OUTLINED_FIELD_LABEL, "pointer-events-none", labelClass)}
  >
    {label}
  </label>
  <SelectPrimitive.Root
    type="single"
    {value}
    onValueChange={choose}
    items={[...choices]}
  >
    <SelectPrimitive.Trigger
      {id}
      class="flex items-center rounded-native-outlined-field border border-native-button-outline-edge bg-transparent ps-lg pe-select-end text-start text-body outline-none block-native-outlined-field inline-full focus-visible:border-accent aria-expanded:border-accent"
      {...triggerProps}
    >
      <span class="truncate">{chosenLabel}</span>
    </SelectPrimitive.Trigger>
    <SelectMenu
      {choices}
      aria-labelledby={labelId}
      class="inline-(--bits-select-anchor-width)"
    />
  </SelectPrimitive.Root>
  <ChevronDown
    size={CHEVRON_SIZE}
    aria-hidden="true"
    class="pointer-events-none absolute inset-e-md inset-bs-1/2 -translate-y-1/2 text-muted"
  />
</div>
