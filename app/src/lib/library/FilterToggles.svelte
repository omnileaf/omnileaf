<script lang="ts" generics="Value extends string">
  import { Check } from "@lucide/svelte";
  import { Toggle } from "bits-ui";
  import type { Snippet } from "svelte";

  interface ToggleOption {
    readonly value: Value;
    readonly label: string;
  }

  const CHECK_SIZE = 14;

  let {
    label,
    options,
    chosen,
    onToggle,
    children,
  }: {
    label: string;
    options: readonly ToggleOption[];
    chosen: readonly Value[];
    onToggle: (value: Value) => void;
    children?: Snippet;
  } = $props();

  const id = $props.id();
</script>

<div class="flex flex-col gap-sm py-setting-grid-pad">
  <p {id} class="text-small font-medium">{label}</p>
  <div role="group" aria-labelledby={id} class="flex flex-wrap gap-sm">
    {#each options as option (option.value)}
      {@const isChosen = chosen.includes(option.value)}
      <Toggle.Root
        bind:pressed={
          () => isChosen,
          () => {
            onToggle(option.value);
          }
        }
        class="flex shrink-0 items-center gap-xs rounded-control border border-border bg-card px-md text-small font-medium whitespace-nowrap block-search-chip hover:bg-hover aria-pressed:border-transparent aria-pressed:bg-chip touch:touch-target-around"
      >
        {#if isChosen}
          <Check size={CHECK_SIZE} aria-hidden="true" />
        {/if}
        {option.label}
      </Toggle.Root>
    {/each}
    {@render children?.()}
  </div>
</div>
