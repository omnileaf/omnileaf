<script lang="ts" generics="Choice extends string">
  import {
    ToggleGroup,
    ToggleGroupItem,
  } from "#lib/components/ui/toggle-group/index.ts";

  let {
    label,
    choices,
    chosen,
    disabled = false,
    onChoose,
  }: {
    label: string;
    choices: readonly { value: Choice; label: string }[];
    chosen: Choice;
    disabled?: boolean;
    onChoose: (choice: Choice) => void;
  } = $props();

  const id = $props.id();
</script>

<div
  class="flex flex-col gap-sm expanded:grid expanded:grid-cols-setting-row expanded:items-center expanded:gap-md"
>
  <p {id} class="text-small font-medium">{label}</p>
  <ToggleGroup
    aria-labelledby={id}
    {disabled}
    class="inline-full"
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
        data-label={choice.label}
        class="grow"
      >
        {choice.label}
      </ToggleGroupItem>
    {/each}
  </ToggleGroup>
</div>
