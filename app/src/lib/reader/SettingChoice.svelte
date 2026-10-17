<script lang="ts" generics="Choice extends string">
  import type { Snippet } from "svelte";

  import {
    ToggleGroup,
    ToggleGroupItem,
  } from "#lib/components/ui/toggle-group/index.ts";

  interface ChoiceOption<Value> {
    readonly value: Value;
    readonly label: string;
    readonly phoneLabel?: string;
  }

  let {
    label,
    hint,
    choices,
    chosen,
    disabled = false,
    isStacked = false,
    onChoose,
    children,
  }: {
    label: string;
    hint?: string;
    choices: readonly ChoiceOption<Choice>[];
    chosen: Choice;
    disabled?: boolean;
    isStacked?: boolean;
    onChoose: (choice: Choice) => void;
    children?: Snippet;
  } = $props();

  const id = $props.id();
</script>

<div
  data-slot="setting-row"
  class={[
    "flex flex-col gap-sm py-setting-grid-pad",
    hint !== undefined &&
      "grid grid-cols-setting-grid items-center gap-x-md min-block-setting-grid-row",
    !isStacked &&
      "expanded:grid expanded:grid-cols-setting-grid expanded:items-center expanded:gap-x-md expanded:min-block-setting-grid-row",
  ]}
>
  {#if hint === undefined}
    <p {id} class="text-small font-medium">{label}</p>
  {:else}
    <div class="flex flex-col gap-2xs">
      <p {id} class="text-small font-medium">{label}</p>
      <p class="text-detail text-muted">{hint}</p>
    </div>
  {/if}
  <ToggleGroup
    aria-labelledby={id}
    {disabled}
    class={[
      hint === undefined && "inline-full",
      !isStacked && "expanded:inline-setting-control",
    ]}
    bind:value={
      () => chosen,
      (value: string) => {
        const choice = choices.find((candidate) => candidate.value === value);
        if (choice !== undefined) {
          onChoose(choice.value);
        }
      }
    }
  >
    {#each choices as choice (choice.value)}
      <ToggleGroupItem value={choice.value} class="grow">
        {#if choice.phoneLabel === undefined}
          {choice.label}
        {:else}
          <span class="expanded:hidden">{choice.phoneLabel}</span>
          <span class="hidden expanded:inline">{choice.label}</span>
        {/if}
      </ToggleGroupItem>
    {/each}
  </ToggleGroup>
  {@render children?.()}
</div>
