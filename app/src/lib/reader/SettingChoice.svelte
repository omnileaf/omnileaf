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
    choices,
    chosen,
    disabled = false,
    isStacked = false,
    onChoose,
    children,
  }: {
    label: string;
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
    !isStacked &&
      "expanded:grid expanded:grid-cols-setting-grid expanded:items-center expanded:gap-x-md expanded:min-block-setting-grid-row",
  ]}
>
  <p {id} class="text-small font-medium">{label}</p>
  <ToggleGroup
    aria-labelledby={id}
    {disabled}
    class={["inline-full", !isStacked && "expanded:inline-setting-control"]}
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
      <ToggleGroupItem
        value={choice.value}
        data-label={choice.phoneLabel === undefined ? choice.label : undefined}
        class="grow"
      >
        {#if choice.phoneLabel === undefined}
          {choice.label}
        {:else}
          <span
            data-label={choice.phoneLabel}
            class="room-for-semibold-label items-center expanded:hidden"
          >
            {choice.phoneLabel}
          </span>
          <span
            data-label={choice.label}
            class="hidden items-center expanded:room-for-semibold-label"
          >
            {choice.label}
          </span>
        {/if}
      </ToggleGroupItem>
    {/each}
  </ToggleGroup>
  {@render children?.()}
</div>
