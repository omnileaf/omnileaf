<script lang="ts" generics="Value extends string">
  import { ChevronDown } from "@lucide/svelte";
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ClassValue } from "svelte/elements";

  import { cn } from "#lib/components/cn.ts";
  import {
    choiceOf,
    type SelectChoice,
    type SelectName,
    SelectMenu,
  } from "#lib/components/ui/select-menu/index.ts";
  import { currentPlatform } from "#lib/page/platform.ts";

  const ICON_SIZE = 16;

  const FIELD =
    "flex-1 appearance-none rounded-select border border-select-edge bg-select ps-md pe-select-end text-label text-ellipsis block-panel-field min-inline-none macos:shadow-raised windows:border-be-windows-stroke-strong linux:shadow-raised";

  type FieldAttributes = SelectName & {
    readonly id?: string;
    readonly "aria-describedby"?: string | undefined;
    readonly [data: `data-${string}`]: unknown;
  };

  let {
    class: className,
    fieldClass,
    icon: Icon = ChevronDown,
    iconSize = ICON_SIZE,
    choices,
    value,
    onChoose,
    ...fieldAttributes
  }: FieldAttributes & {
    class?: ClassValue;
    fieldClass?: string;
    icon?: typeof ChevronDown;
    iconSize?: number;
    choices: readonly SelectChoice<Value>[];
    value: Value;
    onChoose: (value: Value) => void;
  } = $props();

  const drawsItsOwnMenu = currentPlatform() === "android";
  const name: SelectName = $derived(
    fieldAttributes["aria-label"] === undefined
      ? { "aria-labelledby": fieldAttributes["aria-labelledby"] }
      : { "aria-label": fieldAttributes["aria-label"] },
  );
  const chosenLabel = $derived(choiceOf(choices, value)?.label ?? "");

  function choose(picked: string): void {
    const choice = choiceOf(choices, picked);
    if (choice !== undefined) {
      onChoose(choice.value);
    }
  }
</script>

<div class={cn("relative flex items-center", className)}>
  {#if drawsItsOwnMenu}
    <SelectPrimitive.Root
      type="single"
      {value}
      onValueChange={choose}
      items={[...choices]}
    >
      <SelectPrimitive.Trigger
        {...fieldAttributes}
        class={cn(FIELD, "flex items-center text-start", fieldClass)}
      >
        <span class="truncate">{chosenLabel}</span>
      </SelectPrimitive.Trigger>
      <SelectMenu
        {choices}
        {...name}
        class="min-inline-(--bits-select-anchor-width)"
      />
    </SelectPrimitive.Root>
  {:else}
    <select
      {...fieldAttributes}
      class={cn(FIELD, fieldClass)}
      {value}
      onchange={({ currentTarget }) => {
        choose(currentTarget.value);
      }}
    >
      {#each choices as choice (choice.value)}
        <option value={choice.value}>{choice.label}</option>
      {/each}
    </select>
  {/if}
  <Icon
    size={iconSize}
    aria-hidden="true"
    class="pointer-events-none absolute inset-e-pill-inline text-muted"
  />
</div>
